import { JsonRpcProvider } from "ethers"
import { chainView } from "utils/chainView"

import TokenBalancesForMultipleUsers from "../../abis/TokenBalancesForMultipleUsers.json"

import { Prisma } from "@prisma/client"
import { NumMap, TokenBalancesForBoostOut } from "./types"
import { OFFCHAIN_BOOST_INFOS, ONCHAIN_BOOST_INFOS, SNAPSHOT_BOOST_TOKENS } from "./config"
import { BoostRepository } from "db/BoostRepository"

export class BoostService {
  provider: JsonRpcProvider
  boostRepository: BoostRepository

  constructor(provider: JsonRpcProvider, boostRepository: BoostRepository) {
    this.provider = provider
    this.boostRepository = boostRepository
  }

  // MAIN

  async updateBoosts(users: string[]) {
    // Query the bc to get the balances we want to check
    const { timestamp, snapshot } = await this.getOnchainBalancesSnapshot(users)
    // Filter and format raw data from bc with
    const { onchainBoosts, currentDate } = this.computeOnchainBoosts(timestamp, snapshot)

    const offChainBoosts = this.computeOffChainBoost(await this.boostRepository.getOffChainBoostUsers())

    // Aggregate by user the onchain and offchain boosts
    const newBoosts = this.mergeOffChainAndOnChainBoosts(onchainBoosts, offChainBoosts)

    // Retrieve all previous opened boosts
    const lastActiveBoosts = await this.boostRepository.getActiveBoosts()

    const { toDelete, toInsert } = this.createRowsToDeleteAndInsert(lastActiveBoosts, newBoosts, currentDate)

    if (toDelete.length !== 0) {
      await this.boostRepository.deleteUserBoosts(toDelete)
    }
    if (toInsert.length !== 0) {
      await this.boostRepository.insertUserBoosts(toInsert)
    }
  }

  // ONCHAIN

  /**
   * Call a chainview to take a snapshot of all users for ve, NFT and ERC20 tokens we are tracking
   * @users   All users that we want to compute onchain boost
   * @returns An array containing per user an array with all tokens we want to check and the balance of the user
   */
  async getOnchainBalancesSnapshot(users: string[]) {
    // Take the onchain snapshot containing all balances for tracked token giving boost
    const results = await chainView<[string[], string[]], [bigint, TokenBalancesForBoostOut[]]>(
      this.provider,
      TokenBalancesForMultipleUsers.abi,
      TokenBalancesForMultipleUsers.bytecode,
      [SNAPSHOT_BOOST_TOKENS, users]
    )

    return { timestamp: results[0], snapshot: results[1] }
  }

  /**
   * Attribute boost and create a new object groupped by user aggregating boost with different tokens, gives only the boost
   * for each token from a thrashold amount
   * @timestamp block.timestamp returned by the BC
   * @snapshot  Array containing balances for all users
   * @returns A NumMap with the user as key and the sum of all offchain boosts per user
   */
  computeOnchainBoosts(timestamp: bigint, snapshot: TokenBalancesForBoostOut[]) {
    const currentDate = new Date(Number(timestamp) * 1000)
    // Iterate through onchain data and compute the actual boost per user
    // regarding the threshold conditions for each token
    const onchainBoosts: { [user: string]: number } = snapshot.reduce((acc, current) => {
      return {
        ...acc,
        [current.user]: current.tokenBalance.reduce((acc, currentValue) => {
          const boost = ONCHAIN_BOOST_INFOS[currentValue.token]
          // Verify if the minimum threshold is reached to give the boost
          if (BigInt(currentValue.balance) >= boost.min) {
            return acc + boost.boost
          }
          return acc
        }, 1),
      }
    }, {})

    return { onchainBoosts, currentDate }
  }

  // OFFCHAIN

  /**
   * Iterates over all offChainBoosts database and create a new object groupped by user aggregating boost with different types
   * @offChainBoosts The rows in the offChainBoosts database containing user, boost ...
   * @returns A NumMap with the user as key and the sum of all offchain boosts per user
   */
  computeOffChainBoost(offChainBoosts: Prisma.offchain_boost_userCreateManyInput[]) {
    return offChainBoosts.reduce((acc: { [user: string]: number }, current) => {
      return {
        ...acc,
        [current.user_address]: acc[current.user_address] ? acc[current.user_address] + OFFCHAIN_BOOST_INFOS[current.type] : OFFCHAIN_BOOST_INFOS[current.type],
      }
    }, {})
  }

  // MERGING

  /**
   * For each user, find all user boost :
   *   -  To open bcs new user that never had boost before
   *    - To close bcs no more boost on the user
   *    - To close bcs the new boost is different from the last AND to insert a new line starting the new boost
   * @lastActiveBoosts The rows in the user_boost database containing user, boost ...
   * @returns A NumMap with the user as key and the sum of all offchain boosts per user
   */
  createRowsToDeleteAndInsert(lastActiveBoosts: Prisma.user_boostCreateManyInput[], newBoosts: NumMap, currentDate: Date) {
    const toInsert: Prisma.user_boostCreateManyInput[] = []
    const toDelete: bigint[] = []

    // Opens and update boosts already existing boost
    Object.entries(newBoosts).forEach(([user, boost]) => {
      //
      const lastActiveBoost = lastActiveBoosts.find((lastActiveBoost) => lastActiveBoost.user_address === user)

      if (lastActiveBoost) {
        // We update and close only the boost of user if it changed compare to last time otherwise, nothing has to be done
        if (Number(lastActiveBoost.multiplier) !== boost) {
          // Previous boost with the end_at filled because we close it
          toInsert.push({ ...lastActiveBoost, end_at: currentDate })
          // Creates the new boost
          toInsert.push({ user_address: user, start_at: currentDate, multiplier: boost })
          // Delete the old boost before replacing it
          toDelete.push(lastActiveBoost.id as bigint)
        }
      }

      // It's the first time a boost is given to the current user
      // OR
      // An user had some boost, then no boost, then a boost again
      else {
        toInsert.push({ user_address: user, start_at: currentDate, multiplier: boost })
      }
    })

    // Closes boost line that was open and that get closed
    lastActiveBoosts.forEach((lastActiveBoost) => {
      const newBoost = newBoosts[lastActiveBoost.user_address] ? newBoosts[lastActiveBoost.user_address] : 0

      if (!newBoost) {
        toDelete.push(lastActiveBoost.id as bigint)
        toInsert.push({ ...lastActiveBoost, end_at: currentDate })
      }
    })

    return { toInsert, toDelete }
  }

  mergeOffChainAndOnChainBoosts(onchainBoosts: NumMap, offChainBoosts: NumMap): NumMap {
    return Object.entries(offChainBoosts).reduce((acc, [user, offChainBoost]) => {
      const onChainBoost = onchainBoosts[user] ? onchainBoosts[user] : 0
      return {
        ...acc,
        // User boost is capped at 4
        [user]: offChainBoost + onChainBoost > 4 ? 4 : offChainBoost + onChainBoost,
      }
    }, {})
  }
}
