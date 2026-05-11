import { Prisma } from "@prisma/client"
import { JsonRpcProvider } from "ethers"

import PredepositCampaignSnapshot from "../abis/PredepositCampaignSnapshot.json" with { type: "json" }

import { CURVE_GAUGES } from "@tangent/defi-resources"
import { SDT_USG_frxUSD_VAULT, SDT_USG_USDC_VAULT } from "@tangent/defi-resources/build/ressources/erc20/stakeDao.js"
import { BlockRepository } from "../db/BlockRepository.js"
import { AccountedTotal, GetAccountedBalances, PredepositCampaignRepository } from "../db/PredepositCampaignRepository.js"
import { chainView } from "../utils/chainView.js"
import { getAddressesJson } from "../utils/jsonReader.js"

export class PredepositCampaignService {
  predepositRepository: PredepositCampaignRepository
  blockRepository: BlockRepository
  provider: JsonRpcProvider | undefined

  constructor(predepositCampaignRepository: PredepositCampaignRepository, blockRepository: BlockRepository, provider?: JsonRpcProvider | undefined) {
    this.predepositRepository = predepositCampaignRepository
    this.blockRepository = blockRepository
    this.provider = provider
  }

  /* =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-=
            INCREASE / DEPOSIT MANAGEMENT
  =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-= */

  async getUsgLpKeys(): Promise<Prisma.usg_lp_keysCreateManyInput[]> {
    return await this.predepositRepository.getUsgLps()
  }

  /**
   * @notice  During the deposit phase, fetches between 2 blocks all the AddLiquidity events on both LP and parse them.
   *          Cross check with the table or "verified" users to add/modify data on the accounted total and balances in database.
   * @param   isPrivate       When true, the state of the predeposit campaign is private, otherwise it's public.
   * @param   lastBlockNumber The number of the latest block on the blockchain
   * @param   date            Date of the latest block on the blockchain
   */
  async increaseAccountedAmounts(isPrivate: boolean, lastBlockNumber: number, now: Date) {
    const { startBlock, endBlock } = await this.getBlockRange(lastBlockNumber)
    if (startBlock >= endBlock) {
      // Nothing to index
      return
    }
    const accountedUsers = await this.getAccountedUsers(isPrivate)
    // Fetch events between 2 blocks, filter the users that are shouldn't be counted and sort them by LP
    const eventMap = await this.getAndSortAddLiquidityEvents(startBlock, endBlock, accountedUsers)

    // Fetch all accounted_total rows
    const totalsAndCap = await this.getAccountedTotal()

    const totalAccountedRowsToDelete: bigint[] = []
    const totalAccountedRowsToCreate: Prisma.accounted_totalCreateManyInput[] = []
    let balancesAccountedRowsToDelete: bigint[] = []
    let balancesAccountedRowsToCreate: Prisma.accounted_balancesCreateManyInput[] = []

    // Iteration over each events from LP separetely
    for (const [lpId, events] of eventMap) {
      const { usg_lp, ...totalAndCap } = totalsAndCap.find((tc) => Number(tc.usg_lp_id) === lpId)!

      // Useless to compute when cap is reached and no events are there
      if (totalAndCap.cap_lp !== totalAndCap.total_lp && events.length !== 0) {
        // Retrieve the accounted balance for every addresses in the
        const { rowIdTotalToDelete, rowTotalToCreate, rowsBalanceIdsToDelete, rowsBalancesToCreate } = await this.getComputeIncreaseAccountedBalances(
          lpId,
          events,
          totalAndCap
        )
        if (rowIdTotalToDelete !== 0n && rowTotalToCreate) {
          totalAccountedRowsToDelete.push(rowIdTotalToDelete)
          totalAccountedRowsToCreate.push(rowTotalToCreate)
        }
        balancesAccountedRowsToDelete = balancesAccountedRowsToDelete.concat(rowsBalanceIdsToDelete)
        balancesAccountedRowsToCreate = balancesAccountedRowsToCreate.concat(rowsBalancesToCreate)
      }
    }

    // Update accounted total and balances + history
    await this.updateDbState(totalAccountedRowsToDelete, totalAccountedRowsToCreate, balancesAccountedRowsToDelete, balancesAccountedRowsToCreate, now)

    await this.predepositRepository.storePredepositCampaignBlock(endBlock)
  }

  /**
   * @notice  Find the block range to treat
   * @param   currentBlock The latest block number of the blockchain
   * @returns A range of block (start => end) that will be used to process the AddLiquidity events
   */
  private async getBlockRange(currentBlock: number) {
    const blockRange = Number(process.env.INDEXING_BLOCK_RANGE)
    // Get the last indexed block for the Predeposit Campaign
    const blockObject = await this.predepositRepository.getLastPredepositCampaignBlock()

    // Add 1 to the last indexed block because it has been already treated
    const startBlock = (!blockObject ? Number(process.env.STARTING_BLOCK) : Number(blockObject.block_id)) + 1

    const lastEventBlock = await this.blockRepository.getLastEventBlock()
    let lastEventBlockId = 0
    if (lastEventBlock) {
      lastEventBlockId = Number(lastEventBlock.block_id)
    }
    // This case is when the indexer-block is empty / never indexed
    else {
      return { startBlock: 0, endBlock: 0 }
    }

    // Retrieve last block indexed by the indexer block
    // When the distance between the start block and current block is bigger than the range
    // Otherwise, we go to the last indexed block
    const endBlock = startBlock + blockRange < currentBlock ? startBlock + blockRange : lastEventBlockId

    return { startBlock, endBlock }
  }

  /**
   * @notice  Fetches AddLiquidity events between 2 blocks in database and sort them in a map by lp_id
   * @param   currentBlock      Block from the AddLiquidity scan starts
   * @param   endBlock          Block from the AddLiquidity scan stops
   * @param   registeredUsers   Users that are subscribed for the current deposit round
   * @returns A range of block (start => end) that will be used to process the AddLiquidity events
   */
  private async getAndSortAddLiquidityEvents(startBlock: number, endBlock: number, registeredUsers: string[]) {
    const events = await this.predepositRepository.getAddLiquidityEventsInBlockRange(startBlock, endBlock, registeredUsers)
    const eventMap = new Map<number, Prisma.add_liquidity_eventsCreateManyInput[]>()

    events.forEach((ev) => {
      // We take only the events where the liquidity is added one side with the token paired with USG ( USDC or frxUSD )
      if (ev.token1_amount === "0") {
        const key = Number(ev.usg_lp_id)
        const eventList = eventMap.get(key)
        // If entry is already set for this key, we push in the array
        if (eventList) {
          eventList.push(ev)
          eventMap.set(key, eventList)
        }
        // Else, the entry doesn't exist, we create a new array
        else {
          eventMap.set(key, [ev])
        }
      }
    })

    return eventMap
  }

  private async getComputeIncreaseAccountedBalances(
    lpId: number,
    events: Prisma.add_liquidity_eventsCreateManyInput[],
    totalAndCap: Prisma.accounted_totalCreateManyInput
  ) {
    // Removes all events
    const accountedBalances = await this.predepositRepository.getAccountedBalancesForUsersOnLP(
      lpId,
      events.map((ev) => ev.provider)
    )

    let rowIdTotalToDelete = 0n
    let rowTotalToCreate: Prisma.accounted_totalCreateManyInput | null = null

    const rowsBalancesToDelete = new Set<bigint>()
    const rowsBalancesToCreate: Prisma.accounted_balancesCreateManyInput[] = []

    let isTotalModified = false
    // Iterates over all events
    events.forEach((ev) => {
      const capLp = BigInt(totalAndCap.cap_lp)
      const totalLp = rowTotalToCreate ? BigInt(rowTotalToCreate.total_lp) : BigInt(totalAndCap.total_lp)
      const eventLp = BigInt(ev.lp_amount)
      // We don't treat the next events when we reach the cap for an LP
      if (capLp !== totalLp) {
        isTotalModified = true
        if (!rowTotalToCreate) {
          rowTotalToCreate = { ...totalAndCap }
        }
        // If this AddLiquidity brings us over the cap, the use gets only the delta between the total and the cap
        if (totalLp + eventLp >= capLp) {
          ev.lp_amount = (capLp - totalLp).toString()
          rowTotalToCreate.total_lp = rowTotalToCreate.cap_lp
        }
        // If we are reaching the cap
        else {
          rowTotalToCreate.total_lp = (totalLp + eventLp).toString()
        }
        const rowBalance = accountedBalances.find((ac) => ac.user_address === ev.provider)
        // It's possible that an user is doing several AddLiquidity in the same range
        // Need to be carefull and take in priority the corresponding entry in rowsToCreate if it exists
        const i = rowsBalancesToCreate.findIndex((r) => r.user_address === ev.provider)
        if (i !== -1) {
          rowsBalancesToCreate[i].balance_lp = (BigInt(rowsBalancesToCreate[i].balance_lp) + BigInt(ev.lp_amount)).toString()
        } else {
          if (!rowBalance) {
            rowsBalancesToCreate.push({ usg_lp_id: lpId, balance_lp: ev.lp_amount, user_address: ev.provider })
          } else {
            rowsBalancesToCreate.push({
              id: rowBalance.id,
              usg_lp_id: lpId,
              balance_lp: (BigInt(rowBalance.balance_lp) + BigInt(ev.lp_amount)).toString(),
              user_address: ev.provider,
            })
            rowsBalancesToDelete.add(BigInt(rowBalance.id))
          }
        }
      }
    })

    if (isTotalModified) {
      rowIdTotalToDelete = BigInt(totalAndCap.id!)
    }
    return { rowIdTotalToDelete, rowTotalToCreate, rowsBalanceIdsToDelete: Array.from(rowsBalancesToDelete), rowsBalancesToCreate }
  }

  /* =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-=
            DECREASE / WITHDRAW MANAGEMENT
  =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-= */

  /**
   * @notice  During the deposit & retention phase, perform a snpashot at the current blockchain block for all user that have an accumulated balance.
   *          Cross check snapshot and content of accumulated_balances per user, per LP.
   *          When the balance is lower in the snapshot than in the database, we replace the database one by the snpashot one.
   * @param   isPrivate       When true, the state of the predeposit campaign is private, otherwise it's public.
   * @param   date            Date of the latest block on the blockchain
   */
  async decreaseAccountedAmounts(isPrivate: boolean, now: Date) {
    const users = await this.getAccountedUsers(isPrivate)
    const addresses = await getAddressesJson()

    const { totalAccountedToDelete, totalAccountedToInsert, accountedBalancesToDelete, accountedBalancesToInsert } = await this.compareDbAndSnapshots(
      users,
      (
        await this.getOnchainSnapshot(
          users,
          [
            addresses.lps["USG-USDC"],
            SDT_USG_USDC_VAULT.toLowerCase(),
            CURVE_GAUGES.USG_USDC.toLowerCase(),
            "0x3eAFd8C2B36B93A8463A5f460a01A1b3D37b6929".toLowerCase(),
          ],
          [
            addresses.lps["USG-frxUSD"],
            SDT_USG_frxUSD_VAULT.toLowerCase(),
            CURVE_GAUGES.USG_frxUSD.toLowerCase(),
            "0x8D79FA117C3B3a4da1D3F1c037f2e500a2f6D70D".toLowerCase(),
          ]
        )
      )[0],
      await this.predepositRepository.getAllAccountedBalances(),
      await this.predepositRepository.getAccountedTotal()
    )

    await this.updateDbState(totalAccountedToDelete, totalAccountedToInsert, accountedBalancesToDelete, accountedBalancesToInsert, now)
  }

  private async compareDbAndSnapshots(users: string[], onchainSnapshots: bigint[][], databaseData: GetAccountedBalances[], accountedTotals: AccountedTotal[]) {
    const accountedBalancesToDelete: bigint[] = []
    const accountedBalancesToInsert: Prisma.accounted_balancesCreateManyInput[] = []
    const totalAccountedToDelete: bigint[] = []
    const totalAccountedToInsert: Prisma.accounted_totalCreateManyInput[] = []

    // Compare database values with snapshot
    onchainSnapshots.forEach((onChainSnapshot, j) => {
      const lpKey = j === 0 ? "USG-USDC" : "USG-frxUSD"
      const dbData = databaseData.filter((d) => d.usg_lp.lp_name === lpKey)
      const accountedTotal = accountedTotals[j]
      let isTotalChanged = false
      onChainSnapshot.forEach((onChainBal, i) => {
        // Retrieve user from the input of the chainview
        const onChainAddress = users[i].toLowerCase()
        // Find in the database the data containing the merged balance from the database
        const databaseBal = dbData.find((databaseValue) => databaseValue.user_address.toLowerCase() === onChainAddress)
        // If the onchain snapshot of balances is smaller that what we have in db
        // it means the user has less LP compare to what he had through `AddLiquidity` events.
        if (databaseBal) {
          if (onChainBal < BigInt(databaseBal.balance_lp)) {
            isTotalChanged = true
            accountedTotal.total_lp = (BigInt(accountedTotal.total_lp) - (BigInt(databaseBal.balance_lp) - onChainBal)).toString()
            accountedBalancesToDelete.push(databaseBal.id)
            accountedBalancesToInsert.push({
              id: databaseBal.id,
              user_address: databaseBal.user_address,
              usg_lp_id: databaseBal.usg_lp_id,
              balance_lp: onChainBal.toString(),
            })
          }
        }
      })
      if (isTotalChanged) {
        const { usg_lp, ...rest } = accountedTotal
        totalAccountedToInsert.push(rest)
        totalAccountedToDelete.push(accountedTotal.id)
      }
    })
    return {
      totalAccountedToDelete,
      totalAccountedToInsert,
      accountedBalancesToDelete,
      accountedBalancesToInsert,
    }
  }

  /**
   * @notice  Take an onchain snapshot with a chainview of the merged balances for all users.
   * @param   users              List of all users to check the balance of
   * @param   usgUsdcPositions   The latest block number of the blockchain
   * @param   usgFrxUsdPositions The latest block number of the blockchain
   * @returns A range of block (start => end) that will be used to process the AddLiquidity events
   */
  async getOnchainSnapshot(users: string[], usgUsdcPositions: string[], usgFrxUsdPositions: string[]) {
    return await chainView<[string[], string[], string[]], [bigint[][]]>(
      this.provider!,
      PredepositCampaignSnapshot.abi,
      PredepositCampaignSnapshot.bytecode,
      // Format the params for chainview
      [users, usgUsdcPositions, usgFrxUsdPositions]
    )
  }

  /* =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-=
                        COMMON
  =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-= */

  /**
   * @notice  Find the block range to treat
   * @param   currentBlock The latest block number of the blockchain
   * @returns A range of block (start => end) that will be used to process the AddLiquidity events
   */
  async getPredepositState() {
    const state = await this.predepositRepository.getPredepositState()
    if (!state) {
      throw new Error("No state in database")
    }
    return state.state
  }

  /**
   * @notice  Get total accounted rows of both LP in database
   * @returns Rows containing total and cap for each LP of predeposit campaign
   */
  private async getAccountedTotal() {
    return await this.predepositRepository.getAccountedTotal()
  }

  /**
   * @notice  Get all users addresses that are participating to the predeposit campaign.
   *          All users in this table signed to confirm their participation.
   * @param   isPrivate If true, returns only users in the private, otherwise all the users
   * @returns A list of user address
   */
  private async getAccountedUsers(isPrivate: boolean) {
    let users: { user_address: string }[] = []
    if (isPrivate) {
      users = await this.predepositRepository.getPrivateUsers()
    } else {
      users = await this.predepositRepository.getAllUsers()
    }
    return users.map((u) => u.user_address)
  }

  /**
   *  @notice  Update accounted_total and accounted_balances with delete/insert pattern.
   *           Inserts new lines in history tables.
   *  @param   accountedTotalIdToDelete     Ids of accounted_total rows to delete
   *  @param   newAccountedTotals           New rows to insert in accounted_total
   *  @param   accountedBalancesIdToDelete  Ids of accounted_balances rows to delete
   *  @param   newAccountedBalances         New rows to insert in accounted_balances
   *  @param   now Actual date of the blockchain
   */
  private async updateDbState(
    accountedTotalIdToDelete: bigint[],
    newAccountedTotals: Prisma.accounted_totalCreateManyInput[],
    accountedBalancesIdToDelete: bigint[],
    newAccountedBalances: Prisma.accounted_balancesCreateManyInput[],
    now: Date
  ) {
    await this.predepositRepository.deleteAccountedTotal(accountedTotalIdToDelete)
    await this.predepositRepository.insertAccountedTotal(newAccountedTotals)

    await this.predepositRepository.deleteAccountedBalances(accountedBalancesIdToDelete)
    await this.predepositRepository.insertAccountedBalances(newAccountedBalances)

    await this.predepositRepository.insertAccountedTotalHistory(newAccountedTotals, now)
    await this.predepositRepository.insertAccountedBalancesHistory(newAccountedBalances, now)
  }
}
