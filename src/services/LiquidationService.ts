import fs from "fs"

import MarketExternalActionsAbi from "../abis/MarketExternalActions.json" with { type: "json" }
import MarketAccountLiquidationBotInfoAbi from "../abis/MarketAccountLiquidationBotInfo.json" with { type: "json" }
import ICurveRouterAbi from "../abis/ICurveRouter.json" with { type: "json" }
import QuotesCurveRouterImpactAbi from "../abis/QuotesCurveRouterImpact.json" with { type: "json" }
import successRoutesJson from "../../finalRoutes.json" with { type: "json" }

import { Addressable, AddressLike, Contract, Interface, JsonRpcProvider, MaxUint256, Wallet, ZeroAddress, formatEther } from "ethers"
import { ActiveBorrowersRepository } from "../db/ActiveBorrowersRepository.js"
import { type Job } from "bullmq"

import {
  CurveQuote,
  LiquidationAccountOutInfo,
  LiquidationAnalyseInfo,
  LiquidationEstimateInfo,
  LiquidationMarketAccountOutInfo,
  LiquidationMarketOutInfo,
  LiquidationRoute,
  LiquidationUserFullInfo,
  LiquidationUserInInfo,
  SerializedLiquidationUserFullInfo,
  SuccessRoutes,
} from "../type/data.js"
import { chainView } from "../utils/chainView.js"
import { LiquidationExecutionContext } from "./LiquidationExecutionContext.js"
import { BlockRepository } from "../db/BlockRepository.js"
import { LiquidationBotLogService } from "./LiquidationBotLogService.js"
import { TelegramNotifierService } from "./TelegramNotificationServices.js"
import { indexerConfig } from "../config/indexer_config.js"
import { getAddressesJson } from "../utils/jsonReader.js"

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

    let seizingList: LiquidationUserFullInfo[] = [] // borrower with positionvalue < debt
    let liquidationList: LiquidationUserFullInfo[] = [] // borrower with ltv > liquidationThreshold

    // We detect the potential actions we have to do
    hydratedAccounts.forEach((account) => {
      if (account.userDebt === 0n) {
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

    return { seizingList, liquidationList }
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
   * Executes a single seizing of collateral for a given market and account
   * @param pkIndex  the index of the wallet in the context
   * @param account The account/market address to liquidate
   */
  public async executeSeizing(signer: Wallet, account: LiquidationUserFullInfo) {
    const signerAddress = await signer.getAddress()
    const loggedContext = { ...this.context, currentWalletAddress: signerAddress }
    try {
      const currentNonce = await this.context.providers[this.context.currentRpcIndex].getTransactionCount(signerAddress, "pending")
      const marketContract = new Contract(account.market as Addressable, MarketExternalActionsAbi.abi, signer)
      const tx = await marketContract.seizeCollateral(account.account, { nonce: currentNonce })
      await tx.wait() // Wait for the transaction to be mined
      await this.liquidationBotService?.logLiquidationBadDebtExecution(account, loggedContext)
      return tx
    } catch (error) {
      this.errors.push({ action: "liquidation_bad_debt_execution", message: (error as Error)?.message.slice(0, 100), market: account.market as string })
      await this.liquidationBotService?.logError("liquidation_bad_debt_execution", error as Error, loggedContext, { account }, true)
    }
  }

  /**
   * Processes a single liquidation for a given account
   * @param pkIndex  the index of the wallet in the context
   * @param account The account to be liquidated
   */
  public async executeLiquidation(pkIndex: number, account: LiquidationUserFullInfo, slippageModifierBps: bigint = 0n) {
    const loggedContext = { ...this.context, currentWalletIndex: pkIndex }
    try {
      const provider = this.context.providers[this.context.currentRpcIndex]
      const signer = new Wallet(this.context.walletsPks[pkIndex], provider)
      const signerAddress = await signer.getAddress()
      const slippage = 10n + (10n * slippageModifierBps) / 10000n

      const estimations = await this.estimateLiquidation(signer, account, slippage)
      if (!estimations?.length) {
        this.errors.push({
          action: "liquidation_execution",
          message: `No route found for collateral: ${account.collatToken}`,
          market: account.market as string,
        })
        const error = new Error(`No route found for collat :  ${account.collatToken} `)
        await this.liquidationBotService?.logError("liquidation_execution", error as Error, loggedContext, { account }, true)
      }

      for (const estimation of estimations) {
        try {
          const minAmount = estimation.minTgUSDOut - (estimation.minTgUSDOut * slippage) / 100n
          const currentNonce = await provider.getTransactionCount(signerAddress, "pending")
          const marketContract = new Contract(account.market as Addressable, MarketExternalActionsAbi.abi, signer)
          //  console.log("Liquidation data:", account.market, data)
          const tx = await marketContract.liquidate(
            estimation.account,
            MaxUint256,
            minAmount,
            [this.curveRouterAddress, estimation.liquidationCall.routerCall],
            {
              nonce: currentNonce,
            }
          )
          await tx.wait() // Wait for the transaction to be mined
          await this.liquidationBotService?.logLiquidationExecution(account, loggedContext)
        } catch (error) {
          this.errors.push({ action: "liquidation_execution", message: (error as Error)?.message.slice(0, 100), market: account.market as string })
          await this.liquidationBotService?.logError("liquidation_execution", error as Error, loggedContext, { estimation })
        }
      }
    } catch (error) {
      // console.error("Liquidation execution error:", error)
      this.errors.push({ action: "liquidation_execution", message: (error as Error)?.message.slice(0, 100), market: account.market as string })
      await this.liquidationBotService?.logError("liquidation_execution", error as Error, loggedContext, { account }, true)
    }
  }

  private async _getBestRoute(
    providers: JsonRpcProvider[],
    account: LiquidationUserFullInfo
  ): Promise<{ route: LiquidationRoute | null; amount: bigint; priceImpact: number }> {
    // Flatten the nested structure: success[inputTokenAddress][outputTokenAddress] = LiquidationRoute[]
    // The input token address is the key, so we need to find routes where the key matches the collateral token
    const collatTokenLower = (account.collatToken as string).toLowerCase()
    const inputTokenRoutes = successRoutes.success[collatTokenLower]

    if (!inputTokenRoutes) {
      console.error("No route found for collateral:", account.collatToken)
      return { route: null, amount: 0n, priceImpact: 0 }
    }

    // Flatten all routes for this input token across all output tokens
    // Build a Map based on the display property to ensure uniqueness and quick access
    const allRoutesMap = new Map<string, LiquidationRoute & { in: string }>()
    // Initialize allRoutes as an array

    for (const routes of Object.values(inputTokenRoutes)) {
      for (const route of routes) {
        if (route?.display) {
          allRoutesMap.set(route.display, { ...route, in: collatTokenLower })
        }
      }
    }

    if (!allRoutesMap.size) {
      console.error("No route found for collateral:", account.collatToken)
      return { route: null, amount: 0n, priceImpact: 0 }
    }

    // Remove none valid routes
    return await this._evaluatesRoutes(providers, Array.from(allRoutesMap.values()), account)
  }

  private async _evaluatesRoutes(
    providers: JsonRpcProvider[],
    allRoutesMap: (LiquidationRoute & { in: string })[],
    account: LiquidationUserFullInfo
  ): Promise<{ route: LiquidationRoute | null; amount: bigint; priceImpact: number }> {
    const routeParams: CurveQuote[] = Array.from(allRoutesMap.values()).map(
      (route) =>
        ({
          _route: route.params.routeAddresses,
          _swap_params: route.params.swapParamsFull,
          _amount: account.positionValue,
          _pools: [ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress],
        }) satisfies CurveQuote
    )

    const quotes = (
      await chainView<[CurveQuote[]], { quote: bigint; priceImpact: number }[][]>(
        providers[this.context.currentRpcIndex],
        QuotesCurveRouterImpactAbi.abi,
        QuotesCurveRouterImpactAbi.bytecode,
        [routeParams]
      )
    )[0]

    const optimzedIndex = quotes.reduce((maxIdx, cur, idx, arr) => (cur.quote > (arr[maxIdx]?.quote ?? -1000000n) ? idx : maxIdx), 0)
    const param = routeParams[optimzedIndex]
    // TODO check if the max is enough
    return {
      route: {
        display: Array.from(allRoutesMap.values())[optimzedIndex].display,
        params: { routeAddresses: param._route, swapParamsFull: param._swap_params },
      },
      amount: quotes[optimzedIndex].quote,
      priceImpact: quotes[optimzedIndex].priceImpact,
    }
  }

  private async _getBestSplittedRoutes(
    providers: JsonRpcProvider[],
    account: LiquidationUserFullInfo
  ): Promise<
    | {
        route1: { route: LiquidationRoute | null; account: LiquidationUserFullInfo; amount: bigint }
        route2: { route: LiquidationRoute | null; account: LiquidationUserFullInfo; amount: bigint }
        amountTotal: bigint
        priceImpactTotal: number
      }
    | undefined
  > {
    const addresses = await getAddressesJson()
    // on cherches les pools contentant de l'USG
    const lps = Object.entries(addresses.lps).filter(([key, value]) => key.startsWith("USG-"))
    if (lps.length < 2) {
      return
    }
    const lp1 = lps[0]
    const lp2 = lps[1]
    const collatTokenLower = (account.collatToken as string).toLowerCase()
    // we check if the collateral token has enough routes
    const availableRoutes = Object.values(successRoutes.success[collatTokenLower]).flat()
    if (availableRoutes?.length < 2) {
      return
    }

    // we check if the collateral token has at least 1 routes for each LPs
    const lp1Routes = availableRoutes.filter((route) => route.params.routeAddresses.includes(lp1[1])).map((route) => ({ ...route, in: collatTokenLower }))
    const lp2Routes = availableRoutes.filter((route) => route.params.routeAddresses.includes(lp2[1])).map((route) => ({ ...route, in: collatTokenLower }))
    if (lp1Routes?.length < 1 || lp2Routes?.length < 1) {
      return
    }

    // handle trhe account to divide the collateral balance between the 2 LPs
    const dataLp1 = { ...account, collateralBalance: account.collateralBalance / 2n }
    const dataLp2 = { ...account, collateralBalance: account.collateralBalance - dataLp1.collateralBalance }

    // evaluate the best routes for each LP
    const promises = [this._evaluatesRoutes(providers, lp1Routes, dataLp1), this._evaluatesRoutes(providers, lp2Routes, dataLp2)]
    const [{ route: route1, amount: amount1, priceImpact: priceImpact1 }, { route: route2, amount: amount2, priceImpact: priceImpact2 }] =
      await Promise.all(promises)
    // return the combaison of the best routes for each LP
    return {
      route1: { route: route1, account: dataLp1, amount: amount1 },
      route2: { route: route2, account: dataLp2, amount: amount2 },
      amountTotal: amount1 + amount2,
      priceImpactTotal: (priceImpact1 + priceImpact2) / 2,
    }
  }

  private async estimateTransaction(
    route: LiquidationRoute,
    quote: bigint,
    account: LiquidationUserFullInfo,
    signer: Wallet,
    provider: JsonRpcProvider,
    slippageBps: bigint
  ): Promise<LiquidationEstimateInfo> {
    if (!this.curveRouterAddress) {
      throw new Error("curveRouterAddress is not set in LiquidationService")
    }

    const signerAddress = await signer.getAddress()
    const minAmount = quote - (quote * slippageBps) / 10000n
    const iface = new Interface(ICurveRouterAbi.abi)
    const data = iface.encodeFunctionData("exchange", [
      route.params.routeAddresses,
      route.params.swapParamsFull,
      account.collateralBalance,
      minAmount,
      [ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress],
      signerAddress,
    ])

    // Estimate gas for the liquidation transaction
    const marketContract = new Contract(account.market as Addressable, MarketExternalActionsAbi.abi, signer)
    const gasLimit = await marketContract.liquidate.estimateGas(account.account, MaxUint256, minAmount, [this.curveRouterAddress, data])

    // Get current gas price
    const feeData = await provider.getFeeData()
    const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n
    const gasCostWei = gasLimit * gasPrice
    const gasCostEth = Number(formatEther(gasCostWei))

    const grossProfit = quote - account.userDebt

    return {
      // Swap info needed to call liquidate on the contract
      account: account.account,
      collatToLiquidate: MaxUint256,
      minTgUSDOut: minAmount,
      liquidationCall: {
        routerCall: data,
      },
      // Additional estimate information
      expectedOutput: quote,
      slippageBps,
      gasEstimate: {
        gasLimit,
        eth: gasCostEth,
      },
      grossProfit,
    }
  }

  public async estimateLiquidation(signer: Wallet, account: LiquidationUserFullInfo, slippageBps: bigint): Promise<LiquidationEstimateInfo[]> {
    if (!this.curveRouterAddress) {
      throw new Error("curveRouterAddress is not set in LiquidationService")
    }
    const provider = this.context.providers[this.context.currentRpcIndex]

    // Get expected output from the best route
    const { route, amount, priceImpact } = await this._getBestRoute(this.context.providers, account)

    if (!route) {
      throw new Error(`No route found for collateral: ${account.collatToken}`)
    }
    console.error("Price impact:", priceImpact, indexerConfig.liquidationLimits.maxPriceImpact)
    // price impact is too high, we try to split the liquidation into 2 parts
    if (priceImpact > indexerConfig.liquidationLimits.maxPriceImpact) {
      console.error("Price impact is too high, trying to split the liquidation")
      const splittedRoutes = await this._getBestSplittedRoutes(this.context.providers, account)
      if (splittedRoutes) {
        const {
          route1: { route: route1, account: account1, amount: amount1 },
          route2: { route: route2, account: account2, amount: amount2 },
          amountTotal,
          priceImpactTotal,
        } = splittedRoutes as {
          route1: { route: LiquidationRoute | null; account: LiquidationUserFullInfo; amount: bigint }
          route2: { route: LiquidationRoute | null; account: LiquidationUserFullInfo; amount: bigint }
          amountTotal: bigint
          priceImpactTotal: number
        }
        console.error("Splitted routes:", amount1, amount2, priceImpactTotal, amountTotal)
        // is splitted profitable
        if (priceImpactTotal < indexerConfig.liquidationLimits.maxPriceImpact && amountTotal > amount) {
          return [
            await this.estimateTransaction(route1 as LiquidationRoute, amount1, account1, signer, provider, slippageBps),
            await this.estimateTransaction(route2 as LiquidationRoute, amount2, account2, signer, provider, slippageBps),
          ]
        }
      }
    }

    // Build the liquidation transaction data (same as executeLiquidation)
    return [await this.estimateTransaction(route, amount, account, signer, provider, slippageBps)]
  }

  /**
   * Save the files to the database
   * @param data The markets and borrowers to be saved.
   */
  saveFiles(data: { markets: AddressLike[]; borrowers: LiquidationUserInInfo[] }) {
    fs.writeFileSync(this.marketBorrowerFilePath, JSON.stringify(data, null, 2))
  }

  /**
   * Deserializes a serialized liquidation action by converting string BigInt values back to BigInt
   */
  private deserializeLiquidationAction(serialized: SerializedLiquidationUserFullInfo): LiquidationUserFullInfo & { type: "seizing" | "liquidation" } {
    return {
      ...serialized,
      healthRatio: BigInt(serialized.healthRatio),
      userDebt: BigInt(serialized.userDebt),
      positionValue: BigInt(serialized.positionValue),
      collateralBalance: BigInt(serialized.collateralBalance),
    }
  }

  /**
   * Gets the next wallet index using round-robin distribution
   */
  private getNextWalletIndex(walletsPks: string[], counter: { value: number }): number {
    const walletIndex = counter.value % walletsPks.length
    counter.value++
    return walletIndex
  }

  /**
   * Processes a single job from the liquidation queue
   * @param job The Bull queue job containing the serialized liquidation action
   * @param telegramNotifierService Service for sending error notifications
   * @param walletsPks Array of wallet private keys
   * @param walletCounter Counter object for round-robin wallet distribution
   * @returns Promise that resolves when the job is processed
   */
  public async processJob(job: Job<SerializedLiquidationUserFullInfo>, telegramNotifierService: TelegramNotifierService, walletsPk: string): Promise<void> {
    // Deserialize the job data (convert string BigInt values back to BigInt)
    const action = this.deserializeLiquidationAction(job.data)

    const signer = new Wallet(walletsPk, this.context.providers[this.context.currentRpcIndex])

    try {
      if (action.type === "seizing") {
        await this.executeSeizing(signer, action)
      } else if (action.type === "liquidation") {
        // Find wallet index for executeLiquidation (it still uses pkIndex)
        const walletIndex = this.context.walletsPks.findIndex((pk) => pk === walletsPk)
        if (walletIndex === -1) {
          throw new Error(`Wallet not found in context for private key`)
        }
        await this.executeLiquidation(walletIndex, action)
      } else {
        throw new Error(`Unknown action type: ${(action as any).type}`)
      }

      console.log(`Successfully processed ${action.type} for account ${action.account}`)
    } catch (error) {
      console.error(`Error processing ${action.type} for account ${action.account}:`, error)
      await telegramNotifierService.sendError(
        `Liquidation Process Error: Failed to execute ${action.type} for account ${action.account} on market ${action.market}: ${(error as Error).message}`
      )
      // Re-throw to mark job as failed in Bull
      throw error
    }
  }
}
