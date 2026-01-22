import fs from "fs"

import MarketExternalActionsAbi from "../abis/MarketExternalActions.json" with { type: "json" }
import MarketAccountLiquidationBotInfoAbi from "../abis/MarketAccountLiquidationBotInfo.json" with { type: "json" }

import { Addressable, AddressLike, Contract, JsonRpcProvider, MaxUint256, Wallet, formatEther } from "ethers"
import { ActiveBorrowersRepository } from "../db/ActiveBorrowersRepository.js"
import { type Job } from "bullmq"

import {
  LiquidationAccountOutInfo,
  LiquidationAnalyseInfo,
  LiquidationEstimateInfo,
  LiquidationMarketAccountOutInfo,
  LiquidationMarketOutInfo,
  LiquidationRoute,
  LiquidationUserFullInfo,
  LiquidationUserInInfo,
  PendlePTToSYQuote,
  RouterType,
  SerializedLiquidationUserFullInfo,
} from "../type/data.js"
import { chainView } from "../utils/chainView.js"
import { LiquidationExecutionContext } from "./LiquidationExecutionContext.js"
import { BlockRepository } from "../db/BlockRepository.js"
import { LiquidationBotLogService } from "./LiquidationBotLogService.js"
import { TelegramNotifierService } from "./TelegramNotificationServices.js"
import { getAddressesJson } from "src/utils/jsonReader.js"
import { parseEthersError } from "../utils/errorParser.js"
import { indexerConfig } from "src/config/indexer_config.js"
import { getBestRpcProvider } from "../utils/getBestRpcProvider.js"

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
  routerService: RouterService
  // Map to track pending transactions per wallet for sequential processing

  constructor(
    activeBorrowersRepository: ActiveBorrowersRepository,
    context: LiquidationExecutionContext,
    routerService: RouterService,
    LiquidationBotService?: LiquidationBotLogService
  ) {
    this.activeBorrowersRepository = activeBorrowersRepository
    this.context = context
    this.routerService = routerService
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

    // Get the best RPC provider for checking wallet balances
    // Note: Each job will check the best provider at the start, so we don't need to set it in the shared context
    const bestRpc = await getBestRpcProvider(providers)
    const rpcIndexForBalanceCheck = bestRpc.index
    const provider = providers[rpcIndexForBalanceCheck]

    // check all wallets balance remove under the limit (parallelized)
    const walletBalanceChecks = await Promise.all(
      this.context.walletsPks.map(async (pk) => {
        const signer = new Wallet(pk, provider)
        const address = await signer.getAddress()
        const balance = await provider.getBalance(address)
        return {
          pk,
          balance,
          hasSufficientBalance: balance > BigInt(this.minEthBalance * 10 ** 18),
        }
      })
    )

    // Filter wallets with sufficient balance
    this.context.walletsPks = walletBalanceChecks.filter((check) => check.hasSufficientBalance).map((check) => check.pk)
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
    borrowers: LiquidationUserInInfo[],
    marketViewerAddress: string
  ): Promise<LiquidationMarketAccountOutInfo | undefined> {
    // get the data from the  all the providers
    const calls = providers.map((provider, index) =>
      chainView<[AddressLike[], LiquidationUserInInfo[], string], [LiquidationMarketAccountOutInfo]>(
        provider,
        MarketAccountLiquidationBotInfoAbi.abi,
        MarketAccountLiquidationBotInfoAbi.bytecode,
        [markets, borrowers, marketViewerAddress]
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

    if (accountLength !== borrowers.length) {
      const errorMessage = `CRITICAL: Account length mismatch in getOnchainData! Expected ${borrowers.length} accounts (from borrowers), but got ${accountLength} from on-chain data. This indicates a data integrity issue.`
      console.error(`❌ ${errorMessage}`)
      return undefined
    }

    for (let i = 0; i < accountLength; i++) {
      const results = accountsFlat.filter((a) => a.index === i)
      const minHealthRatio = results.reduce<bigint | undefined>((acc, curr) => (acc && acc < curr.healthRatio ? acc : curr.healthRatio), undefined)

      const row = results.find((a) => a.healthRatio === minHealthRatio)
      if (row) {
        finalAccounts.push(row)
      }
    }

    const finalAccountsResult = finalAccounts.filter((a) => a !== undefined)

    if (finalAccountsResult.length !== borrowers.length) {
      const errorMessage = `CRITICAL: Final accounts count (${finalAccountsResult.length}) doesn't match borrowers count (${borrowers.length}) in getOnchainData. This indicates missing accounts from all provider responses.`
      console.error(`❌ ${errorMessage}`)
      return undefined
    }

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
    if (datas.accounts.length !== accounts.length) {
      const errorMessage = `CRITICAL: accounts length mismatch in analyzeLiquidation! On-chain: ${datas.accounts.length}, Borrowers: ${accounts.length}. This indicates a data integrity issue.`
      console.error(`❌ ${errorMessage}`)
      throw new Error(errorMessage)
    }

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
   * @param signer The wallet signer
   * @param account The account/market address to liquidate
   * @param logContext The context for logging (includes RPC index)
   */
  public async executeSeizing(signer: Wallet, account: LiquidationUserFullInfo, logContext: LiquidationExecutionContext) {
    const signerAddress = await signer.getAddress()
    const loggedContext = { ...logContext, currentWalletAddress: signerAddress }
    try {
      // Use the provider from the signer (which was created with the correct RPC)
      const provider = signer.provider!
      const currentNonce = await provider.getTransactionCount(signerAddress, "pending")
      const marketContract = new Contract(account.market as Addressable, MarketExternalActionsAbi.abi, signer)
      const tx = await marketContract.seizeCollateral(account.account, { nonce: currentNonce })
      await tx.wait() // Wait for the transaction to be mined
      await this.liquidationBotService?.logLiquidationBadDebtExecution(account, loggedContext)
      return tx
    } catch (error) {
      this.errors.push({ action: "liquidation_bad_debt_execution", message: (error as Error)?.message.slice(0, 100), market: account.market as string })
      await this.liquidationBotService?.logError("liquidation_bad_debt_execution", error as Error, loggedContext, { account }, true)
      // Re-throw the error so the job is retried by the queue
      throw error
    }
  }

  /**
   * Processes a single liquidation for a given account
   * @param pkIndex  the index of the wallet in the context
   * @param account The account to be liquidated
   * @param slippageModifierBps Slippage modifier in basis points
   * @param nbAttempt Number of attempts made for this liquidation
   * @param rpcIndex Optional RPC provider index (if not provided, uses context.currentRpcIndex)
   * @param logContext Optional context for logging (if not provided, creates one from context)
   */
  public async executeLiquidation(
    pkIndex: number,
    account: LiquidationUserFullInfo,
    slippageModifierBps: bigint = 0n,
    nbAttempt?: number,
    rpcIndex?: number,
    logContext?: LiquidationExecutionContext
  ) {
    // Use provided rpcIndex or fallback to context.currentRpcIndex
    const providerIndex = rpcIndex ?? this.context.currentRpcIndex
    const provider = this.context.providers[providerIndex]
    const signer = new Wallet(this.context.walletsPks[pkIndex], provider)
    const signerAddress = await signer.getAddress()

    // Use provided logContext or create one from context
    const loggedContext = logContext
      ? { ...logContext, currentWalletIndex: pkIndex }
      : { ...this.context, currentWalletIndex: pkIndex, currentRpcIndex: providerIndex }

    const slippage = 50n + (10n * slippageModifierBps) / 10000n

    let estimations: LiquidationEstimateInfo[] = []
    try {
      console.log("estimateLiquidation")
      estimations = await this.estimateLiquidation(signer, account, slippage, providerIndex)
    } catch (error) {
      console.error(error)
      // Parse the error to extract more specific information
      const parsedError = parseEthersError(error as any)
      const errorMessage = parsedError.message || (error as Error)?.message || "Unknown error during liquidation estimation"

      this.errors.push({
        action: "liquidation_execution",
        message: errorMessage.slice(0, 200), // Increased limit for better context
        market: account.market as string,
      })

      // Create an enhanced error object with parsed information
      const enhancedError = new Error(errorMessage)
      enhancedError.name = parsedError.errorName || (error as Error)?.name || "EstimateLiquidationError"
      ;(enhancedError as any).code = parsedError.code

      // Only include originalError if it has useful information
      const errorData: any = {
        ...parsedError,
      }

      // Check if original error has useful information before including it
      if (error && typeof error === "object") {
        const hasUsefulInfo =
          (error as any).message ||
          (error as any).name ||
          (error as any).code ||
          (error as any).stack ||
          (Object.keys(error).length > 0 && Object.keys(error).some((k) => k !== "constructor"))

        if (hasUsefulInfo) {
          errorData.originalError = {
            message: (error as any).message,
            name: (error as any).name,
            code: (error as any).code,
            stack: (error as any).stack,
          }
        }
      }

      await this.liquidationBotService?.logError(
        "liquidation_execution",
        enhancedError,
        loggedContext,
        {
          account,
          error: errorData,
          step: "estimateLiquidation",
        },
        true
      )
      // Re-throw the error so the job is retried by the queue
      throw enhancedError
    }

    if (!estimations?.length) {
      const error = new Error(`No route found for collat :  ${account.collatToken} `)
      ;(error as any).code = "NO_ROUTE"

      this.errors.push({
        action: "liquidation_execution",
        message: `No route found for collateral: ${account.collatToken}`,
        market: account.market as string,
      })
      await this.liquidationBotService?.logError("liquidation_execution", error as Error, loggedContext, { account, step: "no_route" }, true)
      // Don't throw - route not found is a permanent failure that won't succeed on retry
      return
    }

    let successCount = 0
    const errors: Error[] = []

    for (let i = 0; i < estimations.length; i++) {
      const estimation = estimations[i]
      // Use minTgUSDOut directly from estimation
      // The slippageModifierBps is already applied in the slippage calculation (line 406)
      // and included in the estimation.minTgUSDOut via estimateLiquidation
      const minAmount = estimation.minTgUSDOut

      // Validate minAmount is positive and non-zero (required by contract)
      if (minAmount <= 0n) {
        const error = new Error(`Invalid minAmount: ${minAmount.toString()}. minTgUSDOut from estimation is invalid. This should not happen.`)
        ;(error as any).code = "INVALID_MIN_AMOUNT"

        this.errors.push({
          action: "liquidation_preparation",
          message: error.message.slice(0, 200),
          market: account.market as string,
        })

        await this.liquidationBotService?.logError("liquidation_preparation", error, loggedContext, {
          account,
          estimation,
          step: "invalid_min_amount",
        })
        errors.push(error)
        continue // Skip this estimation and try next one
      }

      try {
        const currentNonce = await provider.getTransactionCount(signerAddress, "pending")
        const marketContract = new Contract(account.market as Addressable, MarketExternalActionsAbi.abi, signer)

        const tx = await marketContract.liquidate(
          {
            account: estimation.account,
            postLiquidate: {
              collatAmountToLiquidate: estimation.collatToLiquidate,
              minUsgOut: minAmount,
              maxUsgToBurn: MaxUint256,
              minCollatAmountToLiquidate: 0n,
              isReceiptOut: false,
            },
            minCollatValueToLiquidate: 0n,
          },
          {
            router: estimation.liquidationCall.routerAddress,
            routerCall: estimation.liquidationCall.routerCall,
          },
          {
            nonce: currentNonce,
          }
        )
        await tx.wait() // Wait for the transaction to be mined
        await this.liquidationBotService?.logLiquidationExecution(account, loggedContext)
        successCount++
      } catch (error) {
        this.errors.push({ action: "liquidation_execution", message: (error as Error)?.message.slice(0, 100), market: account.market as string })

        await this.liquidationBotService?.logError("liquidation_execution", error as Error, loggedContext, {
          account,
          estimation,
          error,
          step: "liquidate",
        })
        // Store the error for later re-throwing if all transactions fail
        errors.push(error as Error)
      }
    }

    // If all transactions failed, throw an error so the job is retried
    if (successCount === 0 && errors.length > 0) {
      const lastError = errors[errors.length - 1]
      const errorMessage = `All ${errors.length} liquidation transaction(s) failed. Last error: ${lastError.message}`
      const aggregatedError = new Error(errorMessage)
      aggregatedError.name = lastError.name || "LiquidationError"
      ;(aggregatedError as any).code = (lastError as any).code

      // Re-throw the error so the job is retried by the queue
      throw aggregatedError
    }
  }

  private async estimateTransaction(
    route: LiquidationRoute,
    quote: bigint,
    account: LiquidationUserFullInfo,
    signer: Wallet,
    provider: JsonRpcProvider,
    slippageBps: bigint,
    routerType: RouterType,
    routerAddress: string,
    pendleData?: PendlePTToSYQuote
  ): Promise<LiquidationEstimateInfo> {
    const signerAddress = await signer.getAddress()
    const minAmount = quote - (quote * slippageBps) / 10000n

    // Validate that minAmount is positive
    if (minAmount <= 0n) {
      throw new Error(`Invalid minAmount calculated: ${minAmount.toString()}. Quote: ${quote.toString()}, SlippageBps: ${slippageBps.toString()}`)
    }

    // Validate collateral balance and position value are positive
    if (account.collateralBalance <= 0n) {
      throw new Error(`Invalid collateralBalance: ${account.collateralBalance.toString()}`)
    }
    if (account.positionValue <= 0n) {
      throw new Error(`Invalid positionValue: ${account.positionValue.toString()}`)
    }

    // Build router call data using RouterService
    const data = this.routerService.buildRouterCallData(route, account, minAmount, signerAddress, routerType, pendleData)
    console.log("estimateTransaction", data)

    // Estimate gas for the liquidation transaction
    const marketContract = new Contract(account.market as Addressable, MarketExternalActionsAbi.abi, signer)
    try {
      const params = [
        {
          account: account.account,
          postLiquidate: {
            collatAmountToLiquidate: MaxUint256,
            minUsgOut: 0n,
            maxUsgToBurn: MaxUint256,
            minCollatAmountToLiquidate: 0n,
            isReceiptOut: false,
          },
          minCollatValueToLiquidate: 0n,
        },
        {
          // IMPORTANT: use the router that matches `routerCall` encoding.
          // Hardcoding the Pendle router here makes Curve routes revert with INVALID_SELECTOR during estimateGas.
          router: routerAddress,
          routerCall: data,
        },
      ]
      console.log("marketContract.liquidate", params)

      const gasLimit = await marketContract.liquidate.estimateGas(params[0], params[1])

      // Get current gas price
      const feeData = await provider.getFeeData()
      const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n
      const gasCostWei = gasLimit * gasPrice
      const gasCostEth = Number(formatEther(gasCostWei))

      const grossProfit = quote - account.userDebt

      return {
        account: account.account,
        collatToLiquidate: MaxUint256,
        minTgUSDOut: minAmount,
        liquidationCall: {
          routerCall: data,
          routerAddress,
        },
        expectedOutput: quote,
        slippageBps,
        gasEstimate: {
          gasLimit,
          eth: gasCostEth,
        },
        grossProfit,
        routerType,
      }
    } catch (error) {
      const parsedError = parseEthersError(error as any)
      const enhancedError = new Error(`Gas estimation failed: ${parsedError.message}${parsedError.decodedMessage ? ` (${parsedError.decodedMessage})` : ""}`)
      enhancedError.name = parsedError.errorName || "GasEstimationError"
      ;(enhancedError as any).code = parsedError.code
      ;(enhancedError as any).data = parsedError.rawData
      throw enhancedError
    }
  }

  public async estimateLiquidation(
    signer: Wallet,
    account: LiquidationUserFullInfo,
    slippageBps: bigint,
    rpcIndex?: number
  ): Promise<LiquidationEstimateInfo[]> {
    const providerIndex = rpcIndex ?? this.context.currentRpcIndex
    const provider = this.context.providers[providerIndex]

    // Get expected output from the best route using RouterService

    const { route, amount, priceImpact, routerType, routerAddress, pendleData } = await this.routerService.getBestRoute(account, providerIndex)

    if (!route) {
      throw new Error(`No route found for collateral: ${account.collatToken}`)
    }

    // For Curve routes with high price impact, try to split the liquidation
    // Note: Split routes are only supported for Curve, not Pendle
    if (routerType === "curve" && priceImpact > indexerConfig.liquidationLimits.maxPriceImpact) {
      const splittedRoutes = await this.routerService.getBestSplitCurveRoutes(account, providerIndex)
      if (splittedRoutes) {
        const {
          route1: { route: route1, info: info1, amount: amount1 },
          route2: { route: route2, info: info2, amount: amount2 },
          amountTotal: splittedAmountTotal,
        } = splittedRoutes
        // is splitted profitable
        if (splittedAmountTotal > amount) {
          return [
            await this.estimateTransaction(route1 as LiquidationRoute, amount1, info1, signer, provider, slippageBps, routerType, routerAddress),
            await this.estimateTransaction(route2 as LiquidationRoute, amount2, info2, signer, provider, slippageBps, routerType, routerAddress),
          ]
        }
      }
    }

    // Build the liquidation transaction data
    return [await this.estimateTransaction(route, amount, account, signer, provider, slippageBps, routerType, routerAddress, pendleData)]
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
   * Processes a single job from the liquidation queue
   * @param job The Bull queue job containing the serialized liquidation action
   * @param telegramNotifierService Service for sending error notifications
   * @param walletsPk Wallet private key
   * @param signal Abort signal for cancellation support
   * @param rpcIndex Optional RPC provider index (if not provided, uses context.currentRpcIndex)
   * @param currentBlock Optional current block number (if not provided, uses context.currentBlock)
   * @returns Promise that resolves when the job is processed
   */
  public async processJob(
    job: Job<SerializedLiquidationUserFullInfo>,
    telegramNotifierService: TelegramNotifierService,
    walletsPk: string,
    signal?: AbortSignal,
    rpcIndex?: number,
    currentBlock?: number
  ): Promise<void> {
    // Deserialize the job data (convert string BigInt values back to BigInt)
    const action = this.deserializeLiquidationAction(job.data)

    console.log("process  ", action)

    // Use provided rpcIndex or fallback to context.currentRpcIndex
    const providerIndex = rpcIndex ?? this.context.currentRpcIndex
    const provider = this.context.providers[providerIndex]
    const signer = new Wallet(walletsPk, provider)

    // Create a local context for logging with the correct RPC index
    const logContext: LiquidationExecutionContext = {
      ...this.context,
      currentRpcIndex: providerIndex,
      currentBlock: currentBlock ?? this.context.currentBlock,
    }

    try {
      // Check if job was cancelled before processing
      if (signal?.aborted) {
        throw new Error(`Job cancelled before processing: ${signal.reason || "Unknown reason"}`)
      }

      if (action.type === "seizing") {
        await this.executeSeizing(signer, action, logContext)
      } else if (action.type === "liquidation") {
        // Find wallet index for executeLiquidation (it still uses pkIndex)
        const walletIndex = this.context.walletsPks.findIndex((pk) => pk === walletsPk)
        if (walletIndex === -1) {
          throw new Error(`Wallet not found in context for private key`)
        }
        logContext.currentWalletIndex = walletIndex

        // Calculate slippage modifier based on retry attempts
        // Pattern: 1.0% => 2.0% (increases by 1% per retry)
        const attemptsMade = job.attemptsMade || 0
        const slippageStep = 100n
        const targetSlippageBps = 100n + BigInt(attemptsMade) * slippageStep
        // Calculate modifier needed to achieve target slippage
        const slippageModifierBps = attemptsMade > 0 ? (targetSlippageBps - slippageStep) * 1000n : 0n

        if (attemptsMade > 0) {
          // Calculate the final slippage that will be used
          const finalSlippageBps = 50n + (10n * slippageModifierBps) / 10000n
          const finalSlippagePercent = (Number(finalSlippageBps) / 100).toFixed(2)
          const logMessage = `Retry attempt ${attemptsMade + 1} for job ${job.id} (account: ${action.account}, market: ${action.market}): Increasing slippage to ${finalSlippagePercent}% (${finalSlippageBps} bps)`
          await telegramNotifierService.sendError(logMessage)
        }

        await this.executeLiquidation(walletIndex, action, slippageModifierBps, attemptsMade, providerIndex, logContext)
      } else {
        throw new Error(`Unknown action type: ${(action as any).type}`)
      }
    } catch (error) {
      await telegramNotifierService.sendError(
        `Liquidation Process Error: Failed to execute ${action.type} for account ${action.account} on market ${action.market}: ${(error as Error).message}`
      )
      // Re-throw to mark job as failed in Bull
      throw error
    }
  }
}
