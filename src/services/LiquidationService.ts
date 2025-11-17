import fs from "fs"

import MarketExternalActionsAbi from "../abis/MarketExternalActions.json" with { type: "json" }
import MarketAccountLiquidationBotInfoAbi from "../abis/MarketAccountLiquidationBotInfo.json" with { type: "json" }
import ICurveRouterAbi from "../abis/ICurveRouter.json" with { type: "json" }
import QuoteLiquidationRouterAbi from "../abis/QuoteLiquidationRouter.json" with { type: "json" }
import successRoutesJson from "../../finalRoutes.json" with { type: "json" }

import { Addressable, AddressLike, Contract, Interface, JsonRpcProvider, MaxUint256, Wallet, ZeroAddress } from "ethers"
import { ActiveBorrowersRepository } from "../db/ActiveBorrowersRepository.js"

import {
  CurveQuote,
  LiquidationAccountOutInfo,
  LiquidationAnalyseInfo,
  LiquidationMarketAccountOutInfo,
  LiquidationMarketOutInfo,
  LiquidationRoute,
  LiquidationUserFullInfo,
  LiquidationUserInInfo,
  SuccessRoutes,
} from "../type/data.js"
import { chainView } from "../utils/chainView.js"
import { LiquidationExecutionContext } from "./LiquidationExecutionContext.js"
import { BlockRepository } from "../db/BlockRepository.js"
import { LiquidationBotLogService } from "./LiquidationBotLogService.js"

const successRoutes = successRoutesJson as unknown as SuccessRoutes

const DENOMINATOR = 100_000n

type WithToObject<T> = T & {
  toObject: () => T
}

export class LiquidationService {
  errors: { action: string; message: string; market: string }[] = []
  activeBorrowersRepository: ActiveBorrowersRepository
  context: LiquidationExecutionContext
  liquidationBotService?: LiquidationBotLogService
  marketBorrowerFilePath: string = "./src/data/market_borrowers.json"
  transactionFilePath: string = "./src/data/transactions.json"
  minEthBalance: number = 0.1
  curveRouterAddress: AddressLike | undefined
  // Map to track pending transactions per wallet for sequential processing
  private walletQueues: Map<number, Array<() => Promise<any>>> = new Map()
  private walletQueueProcessing: Map<number, Promise<void>> = new Map()

  constructor(activeBorrowersRepository: ActiveBorrowersRepository, context: LiquidationExecutionContext, LiquidationBotService?: LiquidationBotLogService) {
    this.activeBorrowersRepository = activeBorrowersRepository
    this.context = context
    this.liquidationBotService = LiquidationBotService
  }

  async checkContext() {
    const providers = this.context.providers

    const blockRepository = new BlockRepository(null!)
    blockRepository.setClient(this.activeBorrowersRepository.prismaClient)

    // try the database connectivty
    try {
      await blockRepository.getLastEventBlock()
      this.context.isDbAlive = true
    } catch (error) {
      this.context.isDbAlive = false
    }
    // this.context.isDbAlive = false
    // TODO : check the RPCs , and set the rpcIndex on context

    // get the current block from all rpcs, do not throw an error if one fails
    const currentBlocks = await Promise.all(
      providers.map((provider) =>
        provider.getBlockNumber().catch(() => {
          return 0
        })
      )
    )

    // get max block index
    const maxBlockIndex = currentBlocks.indexOf(Math.max(...currentBlocks))
    if (maxBlockIndex === -1 || currentBlocks[maxBlockIndex] === 0) {
      throw new Error("NO_RPC_CONNECTED")
    }

    this.context.currentRpcIndex = maxBlockIndex
    this.context.currentBlock = Number(currentBlocks[maxBlockIndex])

    // check all wallets balance remove under the limit
    this.context.walletsPks = this.context.walletsPks.filter(async (pk) => {
      const signer = new Wallet(pk, providers[this.context.currentRpcIndex])
      const balance = await providers[this.context.currentRpcIndex].getBalance(await signer.getAddress())
      return balance > BigInt(this.minEthBalance * 10 ** 18)
    })
  }

  async getLiquidationParams(): Promise<{ markets: AddressLike[]; borrowers: LiquidationUserInInfo[] }> {
    if (this.context.isDbAlive) {
      const data = await this.getLiquidationParamsFromDb()
      return data
    } else {
      const data = await this.getLiquidationParamsFromFile()
      return data
    }
  }

  async getLiquidationParamsFromFile(): Promise<{ markets: AddressLike[]; borrowers: LiquidationUserInInfo[] }> {
    // Read the file synchronously (you can also use async methods)
    const data = fs.readFileSync(this.marketBorrowerFilePath, "utf-8")

    // Parse the JSON content
    const parsedData = JSON.parse(data)

    // Return the expected structure
    return {
      markets: parsedData.markets, // Assuming the markets field is an array of AddressLike
      borrowers: parsedData.borrowers, // Assuming borrowers field is an array of LiquidationUserInInfo
    }
  }

  /**
   * Retrieves the parameters required for liquidation.
   * @returns An object containing the markets and borrowers to be liquidated.
   */
  async getLiquidationParamsFromDb(): Promise<{ markets: AddressLike[]; borrowers: LiquidationUserInInfo[] }> {
    if (this.context.isDbAlive) {
      const borrowersRawList = await this.activeBorrowersRepository.getAll()

      const markets = new Set<AddressLike>()
      const borrowers = borrowersRawList.map((borrower) => {
        markets.add(borrower.market.contract_address as AddressLike)
        return {
          account: borrower.borrower_address as AddressLike,
          market: borrower.market.contract_address as AddressLike,
        }
      })
      return { markets: Array.from(markets), borrowers }
    } else {
      const data = fs.readFileSync(this.marketBorrowerFilePath, "utf-8")
      return JSON.parse(data)
    }
  }

  /**
   * Retrieves on-chain data for liquidation analysis.
   * @param provider The JSON RPC provider.
   * @param markets The markets to be analyzed.
   * @param borrowers The borrowers to be analyzed.
   * @returns LiquidationMarketAccountOutInfo or undefined.
   */
  async getOnchainData(
    providers: JsonRpcProvider[],
    markets: AddressLike[],
    borrowers: LiquidationUserInInfo[]
  ): Promise<LiquidationMarketAccountOutInfo | undefined> {
    // get the data from the  all the providers
    const calls = providers.map((provider, index) =>
      chainView<[AddressLike[], LiquidationUserInInfo[]], [LiquidationMarketAccountOutInfo]>(
        provider,
        MarketAccountLiquidationBotInfoAbi.abi,
        MarketAccountLiquidationBotInfoAbi.bytecode,
        [markets, borrowers]
      )
    )

    const results = await Promise.all(calls)
    const datas = results.map((result, callIndex) => {
      const d = result?.at(0)
      if (d) {
        return {
          markets: d.markets.map((m) => (m as unknown as WithToObject<LiquidationMarketOutInfo>).toObject()),
          accounts: d.accounts.map((a, index) => ({ ...(a as unknown as WithToObject<LiquidationAccountOutInfo>).toObject(), callIndex, index })),
        }
      }
      return undefined
    })

    // remove duplicates in markets
    const marketsResult = datas
      .map((d) => d?.markets || [])
      .flat()
      .filter((m, index, self) => self.findIndex((t) => t.market === m.market) === index)

    // remove duplicates in accounts and keep the one with the highest healthRatio
    const finalAccounts = []
    const accountLength = datas?.at(0)?.accounts?.length || 0
    const accountsFlat = datas.map((d) => d?.accounts || []).flat()
    for (let i = 0; i < accountLength; i++) {
      const results = accountsFlat.filter((a) => a.index === i)
      const minHealthRatio = results.reduce<bigint | undefined>((acc, curr) => (acc && acc < curr.healthRatio ? acc : curr.healthRatio), undefined)

      const row = results.find((a) => a.healthRatio === minHealthRatio)
      finalAccounts.push(row)
    }
    const finalAccountsResult = finalAccounts.filter((a) => a !== undefined)
    return { markets: marketsResult, accounts: finalAccountsResult as LiquidationAccountOutInfo[] }
  }

  /**
   * Analyzes liquidation opportunities.
   * @param datas The liquidation market account out info.
   * @param markets The markets to be analyzed.
   * @param accounts The accounts to be analyzed.
   * @returns LiquidationAnalyseInfo.
   */
  async analyzeLiquidation(datas: LiquidationMarketAccountOutInfo, accounts: LiquidationUserInInfo[]): Promise<LiquidationAnalyseInfo> {
    const hydratedAccounts = datas.accounts.map((accountData, index) => {
      const account = accounts[index]
      const market = datas.markets.find((m) => (m.market as string).toLowerCase() === (accountData.market as string).toLowerCase())
      return {
        ...accountData,
        ...account,
        ...market,
        ltv: accountData.positionValue === 0n ? 0n : (accountData.userDebt * DENOMINATOR) / accountData.positionValue,
      }
    })

    const notDebtorAnymoreList: LiquidationUserInInfo[] = [] // borrower with 0 debt
    let seizingList: LiquidationUserFullInfo[] = [] // borrower with positionvalue < debt
    let liquidationList: LiquidationUserFullInfo[] = [] // borrower with ltv > liquidationThreshold

    // We detect the potential actions we have to do
    hydratedAccounts.forEach((account) => {
      if (account.userDebt === 0n) {
        notDebtorAnymoreList.push({ account: account.account, market: account.market })
        return
      }

      if (account.userDebt >= account.positionValue) {
        seizingList.push(account as LiquidationUserFullInfo)
        return
      }
      if (account.ltv > account.liquidationThreshold!) {
        liquidationList.push(account as LiquidationUserFullInfo)
      }
    })

    const sortFn: (a: LiquidationUserFullInfo, b: LiquidationUserFullInfo) => number = (a, b) => Number(b.positionValue) - Number(a.positionValue)

    seizingList = seizingList.sort(sortFn)
    liquidationList = liquidationList.sort(sortFn)

    return { seizingList, liquidationList, notDebtorAnymoreList }
  }

  /**
   * Prioritizes the liquidation actions by combining seizing and liquidation lists,
   * then sorting them by position value in descending order.
   *
   * Prioritization strategy:
   * - Seizing actions (bad debt) are combined with liquidation actions
   * - All actions are sorted by positionValue (highest first) to prioritize larger positions
   * - This ensures the most valuable liquidations are processed first
   * - All actions are returned (not limited by wallet count) as they will be distributed
   *   across available wallets in round-robin fashion by the caller
   *
   * @param seizingList The list of seizing actions (bad debt cases where debt >= position value)
   * @param liquidationList The list of liquidation actions (cases where LTV > liquidation threshold)
   * @returns The prioritized liquidation actions sorted by position value (descending)
   */
  prioritizeActions(
    seizingList: LiquidationUserFullInfo[],
    liquidationList: LiquidationUserFullInfo[]
  ): (LiquidationUserFullInfo & { type: "seizing" | "liquidation" })[] {
    console.log("Prioritizing actions:", seizingList.length, liquidationList.length)
    // Combine both action types with their type indicator
    const actionsList = [
      ...seizingList.map((a) => ({ ...a, type: "seizing" as const })),
      ...liquidationList.map((b) => ({ ...b, type: "liquidation" as const })),
    ]
    // Sort by position value in descending order (highest value first)
    const sortedActionsList = actionsList.sort((a, b) => Number(b.positionValue) - Number(a.positionValue))

    // Return all actions, not limited by wallet count
    // The caller will distribute these across wallets in round-robin fashion
    return sortedActionsList || []
  }

  /**
   * Processes the queue for a specific wallet sequentially
   * @param pkIndex The wallet index
   */
  private async _processWalletQueue(pkIndex: number): Promise<void> {
    // If already processing, wait for it to complete
    const existingProcess = this.walletQueueProcessing.get(pkIndex)
    if (existingProcess) {
      await existingProcess
      return
    }

    // Create a new processing promise
    const processingPromise = (async () => {
      while (true) {
        // TODO : add a timeout to the queue & a limit for a  run ?
        const queue = this.walletQueues.get(pkIndex)

        if (!queue || queue.length === 0) {
          break
        }
        const transactionFn = queue.shift()
        if (!transactionFn) {
          break
        }
        try {
          await transactionFn()
        } catch (error) {
          // Error is handled by the transaction function itself
          console.error(`Error in wallet ${pkIndex} transaction:`, error)
        }
      }

      this.walletQueueProcessing.delete(pkIndex)
      this.walletQueues.delete(pkIndex)
    })()

    this.walletQueueProcessing.set(pkIndex, processingPromise)
    await processingPromise
  }

  /**
   * Executes a transaction with proper nonce management and locking per wallet
   * @param pkIndex The wallet index
   * @param transactionFn The function that sends the transaction
   * @returns The transaction result
   */
  private async _executeWithNonceLock<T>(pkIndex: number, transactionFn: (nonce: number) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Add transaction to queue
      if (!this.walletQueues.has(pkIndex)) {
        this.walletQueues.set(pkIndex, [])
      }
      this.walletQueues.get(pkIndex)!.push(async () => {
        try {
          const provider = this.context.providers[this.context.currentRpcIndex]
          const signer = new Wallet(this.context.walletsPks[pkIndex], provider)
          const signerAddress = await signer.getAddress()

          // Get the current nonce right before sending (ensures sequential nonce assignment)
          const currentNonce = await provider.getTransactionCount(signerAddress, "pending")
          // Execute the transaction with the correct nonce
          const result = await transactionFn(currentNonce)
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })

      // Start processing the queue if not already processing
      this._processWalletQueue(pkIndex).catch(reject)
    })
  }

  /**
   * Executes a single seizing of collateral for a given market and account
   * @param pkIndex  the index of the wallet in the context
   * @param account The account/market address to liquidate
   */
  public async executeSeizing(pkIndex: number, account: LiquidationUserFullInfo) {
    const provider = this.context.providers[this.context.currentRpcIndex]
    const signer = new Wallet(this.context.walletsPks[pkIndex], provider)

    const loggedContext = { ...this.context, currentWalletIndex: pkIndex }
    try {
      await this._executeWithNonceLock(pkIndex, async (currentNonce) => {
        const marketContract = new Contract(account.market as Addressable, MarketExternalActionsAbi.abi, signer)
        const tx = await marketContract.seizeCollateral(account.account, { nonce: currentNonce })
        await tx.wait() // Wait for the transaction to be mined
        await this.liquidationBotService?.logLiquidationBadDebtExecution(account, loggedContext)
        return tx
      })
    } catch (error) {
      this.errors.push({ action: "liquidation_bad_debt_execution", message: (error as Error)?.message.slice(0, 100), market: account.market as string })
      await this.liquidationBotService?.logError("liquidation_bad_debt_execution", error as Error, loggedContext, { account })
    }
  }

  /**
   * Processes a single liquidation for a given account
   * @param pkIndex  the index of the wallet in the context
   * @param account The account to be liquidated
   */
  public async executeLiquidation(pkIndex: number, account: LiquidationUserFullInfo) {
    const { route, amount } = await this._getBestRoute(this.context.providers, account)

    const loggedContext = { ...this.context, currentWalletIndex: pkIndex }

    if (route) {
      try {
        const provider = this.context.providers[this.context.currentRpcIndex]
        const signer = new Wallet(this.context.walletsPks[pkIndex], provider)
        const signerAddress = await signer.getAddress()
        const slippage = 10n //  /100n
        const minAmount = amount - (amount * slippage) / 100n
        const iface = new Interface(ICurveRouterAbi.abi)
        const data = iface.encodeFunctionData("exchange", [
          route.params.routeAddresses,
          route.params.swapParamsFull,
          account.collateralBalance,
          minAmount,
          [ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress],
          signerAddress,
        ])

        await this._executeWithNonceLock(pkIndex, async (currentNonce) => {
          const marketContract = new Contract(account.market as Addressable, MarketExternalActionsAbi.abi, signer)
          //  console.log("Liquidation data:", account.market, data)
          const tx = await marketContract.liquidate(account.account, MaxUint256, minAmount, [this.curveRouterAddress, data], { nonce: currentNonce })
          await tx.wait() // Wait for the transaction to be mined

          await this.liquidationBotService?.logLiquidationExecution(account, loggedContext)

          return tx
        })
      } catch (error) {
        // console.error("Liquidation execution error:", error)
        this.errors.push({ action: "liquidation_execution", message: (error as Error)?.message.slice(0, 100), market: account.market as string })

        await this.liquidationBotService?.logError("liquidation_execution", error as Error, loggedContext, { route, account })
      }
    } else {
      this.errors.push({ action: "liquidation_execution", message: `No route found for collateral: ${account.collatToken}`, market: account.market as string })

      const error = new Error(`No route found for collat :  ${account.collatToken} `)
      await this.liquidationBotService?.logError("liquidation_execution", error as Error, loggedContext, { account })
    }
  }

  async _getBestRoute(providers: JsonRpcProvider[], account: LiquidationUserFullInfo) {
    // Flatten the nested structure: success[inputTokenAddress][outputTokenAddress] = LiquidationRoute[]
    // The input token address is the key, so we need to find routes where the key matches the collateral token
    const collatTokenLower = (account.collatToken as string).toLowerCase()
    const inputTokenRoutes = successRoutes.success[collatTokenLower]

    if (!inputTokenRoutes) {
      console.error("No route found for collateral:", account.collatToken)
      return { route: null, amount: 0n }
    }

    // Flatten all routes for this input token across all output tokens
    const allRoutes: (LiquidationRoute & { in: string })[] = []
    for (const routes of Object.values(inputTokenRoutes)) {
      for (const route of routes) {
        allRoutes.push({ ...route, in: collatTokenLower })
      }
    }

    if (!allRoutes.length) {
      console.error("No route found for collateral:", account.collatToken)
      return { route: null, amount: 0n }
    }

    // Find duplicates in the routes by display property safely
    const uniqueRoutes = allRoutes.filter((route, index, self) => self.findIndex((t) => t && route && t.display === route.display) === index)
    const routeParams = uniqueRoutes.map(
      (route) =>
        ({
          display: route.display,
          _route: route.params.routeAddresses,
          _swap_params: route.params.swapParamsFull,
          _amount: account.positionValue,
          _pools: [ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress],
        }) as CurveQuote
    )

    const quotes = (
      await chainView<[CurveQuote[]], bigint[][]>(providers[this.context.currentRpcIndex], QuoteLiquidationRouterAbi.abi, QuoteLiquidationRouterAbi.bytecode, [
        routeParams,
      ])
    )[0]

    const { index: maxIndex } = quotes.reduce((acc, val, idx) => (val > acc.value ? { index: idx, value: val } : acc), { index: -1, value: -1000000n })
    // TODO check if the max is enough
    return { route: uniqueRoutes[maxIndex], amount: quotes[maxIndex] }
  }

  /**
   * Save the files to the database
   * @param data The markets and borrowers to be saved.
   */
  saveFiles(data: { markets: AddressLike[]; borrowers: LiquidationUserInInfo[] }) {
    fs.writeFileSync(this.marketBorrowerFilePath, JSON.stringify(data, null, 2))
  }
}
