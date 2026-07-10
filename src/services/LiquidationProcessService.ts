import MarketExternalActionsAbi from "../abis/MarketExternalActions.json" with { type: "json" }
import IERC20Abi from "../abis/IERC20.json" with { type: "json" }

import { Addressable, AddressLike, Contract, Interface, JsonRpcProvider, MaxUint256, Wallet, formatEther } from "ethers"
import { type Job } from "bullmq"

import {
  LiquidationEstimateInfo,
  LiquidationExecutionResult,
  LiquidationRoute,
  LiquidationUserFullInfo,
  LiquidationUserInInfo,
  PendlePTToSYQuote,
  RouteCandidate,
  RouterType,
  SerializedLiquidationUserFullInfo,
} from "../type/data.js"
import { LiquidationExecutionContext } from "./LiquidationExecutionContext.js"
import { LiquidationBotLogService } from "./LiquidationBotLogService.js"
import { TelegramNotifierService } from "./TelegramNotificationServices.js"
import { parseEthersError } from "../utils/errorParser.js"
import { liquidationConfig } from "../config/liquidation_config.js"
import { RouterService } from "./RouterService.js"
import { getAddressesJson } from "../utils/jsonReader.js"

export class LiquidationProcessService {
  errors: { action: string; message: string; market: string }[] = []
  context: LiquidationExecutionContext
  liquidationBotService?: LiquidationBotLogService
  routerService: RouterService

  constructor(context: LiquidationExecutionContext, routerService: RouterService, liquidationBotService?: LiquidationBotLogService) {
    this.context = context
    this.routerService = routerService
    this.liquidationBotService = liquidationBotService
  }

  private async saveLiquidationExecution(
    account: LiquidationUserFullInfo | LiquidationUserInInfo,
    context: LiquidationExecutionContext,
    executionResult?: LiquidationExecutionResult
  ) {
    try {
      await this.liquidationBotService?.logLiquidationExecution(account, context, executionResult)
    } catch (logError) {
      console.error("Failed to write liquidation execution log to DB", logError)
    }
  }

  private async saveLiquidationExecutionError(context: LiquidationExecutionContext, error: Error, account: { account?: AddressLike; market?: AddressLike }) {
    try {
      await this.liquidationBotService?.logLiquidationExecutionError(context, error, account)
    } catch (logError) {
      console.error("Failed to write liquidation execution error to DB", logError)
    }
  }

  private async saveSeizingExecution(account: LiquidationUserInInfo, context: LiquidationExecutionContext, txHash?: string) {
    try {
      await this.liquidationBotService?.logLiquidationBadDebtExecution(account, context, txHash)
    } catch (logError) {
      console.error("Failed to write seizing execution log to DB", logError)
    }
  }

  private async saveSeizingExecutionError(context: LiquidationExecutionContext, error: Error, account: { account?: AddressLike; market?: AddressLike }) {
    try {
      await this.liquidationBotService?.logLiquidationBadDebtExecutionError(context, error, account)
    } catch (logError) {
      console.error("Failed to write seizing execution error to DB", logError)
    }
  }

  private async safeLogActionError(
    action: "liquidation_execution" | "liquidation_preparation" | "liquidation_bad_debt_execution",
    error: Error,
    context: LiquidationExecutionContext,
    additionalData?: any
  ) {
    try {
      await this.liquidationBotService?.logError(action, error, context, additionalData, false)
    } catch (logError) {
      console.error(`Failed to write ${action} action log to DB`, logError)
    }
  }

  /**
   * Parse Liquidate and incoming USG Transfer events to calculate routed liquidation profit.
   */
  private parseLiquidateEvent(receipt: any, marketAddress: string, usgAddress: string, receiver: string): LiquidationExecutionResult | null {
    try {
      const marketInterface = new Interface(MarketExternalActionsAbi.abi)
      const erc20Interface = new Interface(IERC20Abi.abi)
      let usgReceived = 0n
      let liquidateEvent: any = null

      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === marketAddress.toLowerCase()) {
          try {
            const parsed = marketInterface.parseLog({ topics: log.topics, data: log.data })
            if (parsed?.name === "Liquidate") {
              liquidateEvent = parsed
            }
          } catch {
            // Not a Liquidate event, continue
          }
        }

        if (log.address.toLowerCase() === usgAddress.toLowerCase()) {
          try {
            const parsed = erc20Interface.parseLog({ topics: log.topics, data: log.data })
            if (parsed?.name === "Transfer" && (parsed.args.to as string).toLowerCase() === receiver.toLowerCase()) {
              usgReceived += parsed.args.value as bigint
            }
          } catch {
            // Not a Transfer event, continue
          }
        }
      }

      if (liquidateEvent) {
        const repaidAmount = liquidateEvent.args.repaidAmount as bigint
        const fee = liquidateEvent.args.fee as bigint
        return {
          repaidAmount,
          debtShares: liquidateEvent.args.debtShares,
          fee,
          collateralLiquidated: liquidateEvent.args.collateralLiquidated,
          liquidator: liquidateEvent.args.liquidator,
          transactionHash: receipt.hash,
          liquidationProfit: usgReceived - repaidAmount - fee,
        }
      }
    } catch (error) {
      console.warn("Failed to parse Liquidate event:", error)
    }
    return null
  }

  /**
   * Calculates the minimum collateral value to liquidate based on oracle price with protection percentage.
   * This protects against executing liquidations when the oracle price drops drastically.
   *
   * Formula: minCollatValueToLiquidate = (collateralBalance * collateralUSDPrice * (10000 - protectionBps)) / (10^oracleDecimals * 10000)
   *
   * Example: If oracle is at $1, with 1.5% protection (150 bps), the minimum value is 98.5% of the oracle price.
   *
   * @param account The liquidation account with collateral balance and market price info
   * @returns The minimum collateral value to liquidate in USD (with 18 decimals)
   */
  private calculateMinCollatValueToLiquidate(account: LiquidationUserFullInfo): bigint {
    const bpsDenominator = 10_000n
    const protectionBps = BigInt(liquidationConfig.limits.oraclePriceProtectionBps)
    const protectionMultiplier = bpsDenominator - protectionBps // e.g., 10000 - 150 = 9850 for 1.5% protection

    // Get collateral USD price (required for calculation)
    if (!account.collateralUSDPrice || !account.oracleDecimals) {
      throw new Error(`collateralUSDPrice or oracleDecimals is missing for account ${account.account} on market ${account.market}`)
    }

    // Get oracle decimals (default to 18 if not available)
    // Ensure oracleDecimals is converted to number for exponentiation
    const oracleDecimalsNumber = typeof account.oracleDecimals === "bigint" ? Number(account.oracleDecimals) : Number(account.oracleDecimals)
    // Calculate 10^oracleDecimals as number then convert to BigInt to avoid TypeScript type issues
    const oracleDecimalsDivisor = BigInt(10 ** oracleDecimalsNumber)

    // Ensure BigInt values are properly converted (account may come from JSON with string values)
    const collateralBalanceBigInt = BigInt(account.collateralBalance)
    const collateralUSDPriceBigInt = BigInt(account.collateralUSDPrice || 0)

    // Calculate: (collateralBalance * collateralUSDPrice * protectionMultiplier) / (oracleDecimalsDivisor * bpsDenominator)
    // This gives the minimum collateral value in USD
    return (collateralBalanceBigInt * collateralUSDPriceBigInt * protectionMultiplier) / (oracleDecimalsDivisor * bpsDenominator)
  }

  private checkRecoveredValueCoversDebt(totalRecovered: bigint, userDebt: bigint, routeContext: "single" | "split") {
    if (totalRecovered < userDebt) {
      const error = new Error(
        `Liquidation ${routeContext} route output does not cover debt value: recovered=${totalRecovered.toString()}, debt=${userDebt.toString()}`
      )
      ;(error as any).code = "INSUFFICIENT_RECOVERED_VALUE"
      throw error
    }
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
      await this.saveSeizingExecution(account, loggedContext, tx.hash)
      return tx
    } catch (error) {
      this.errors.push({ action: "liquidation_bad_debt_execution", message: (error as Error)?.message.slice(0, 100), market: account.market as string })
      await this.saveSeizingExecutionError(loggedContext, error as Error, account)
      await this.safeLogActionError("liquidation_bad_debt_execution", error as Error, loggedContext, { account })
      // Re-throw the error so the job is retried by the queue
      throw error
    }
  }

  /**
   * Processes a single liquidation for a given account
   * @param pkIndex  the index of the wallet in the context
   * @param account The account to be liquidated
   * @param slippageModifierBps Internal modifier used to increase the base 50 bps slippage on retries
   * @param nbAttempt Number of attempts made for this liquidation
   * @param rpcIndex Optional RPC provider index (if not provided, uses context.currentRpcIndex)
   * @param logContext Optional context for logging (if not provided, creates one from context)
   */
  public async executeLiquidation(
    pkIndex: number,
    account: LiquidationUserFullInfo,
    slippageModifierBps: bigint = 0n,
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

    // Ensure BigInt values are properly converted (account may come from JSON with string values)
    const normalizedAccount: LiquidationUserFullInfo = {
      ...account,
      collateralBalance: BigInt(account.collateralBalance || "0"),
      positionValue: BigInt(account.positionValue || "0"),
      userDebt: BigInt(account.userDebt || "0"),
      healthRatio: BigInt(account.healthRatio || "0"),
    }
    const addresses = await getAddressesJson()

    let estimations: LiquidationEstimateInfo[] = []
    try {
      estimations = await this.estimateLiquidation(signer, normalizedAccount, slippage, providerIndex)
    } catch (error) {
      console.error(error)
      // Parse the error to extract more specific information
      const parsedError = parseEthersError(error as any)
      const errorMessage = parsedError.message || (error as Error)?.message || "Unknown error during liquidation estimation"

      this.errors.push({
        action: "liquidation_execution",
        message: errorMessage.slice(0, 200), // Increased limit for better context
        market: normalizedAccount.market as string,
      })

      await this.saveLiquidationExecutionError(loggedContext, error as Error, normalizedAccount)
      await this.safeLogActionError("liquidation_execution", error as Error, loggedContext, {
        account,
        step: "estimateLiquidation",
      })
      // Re-throw the error so the job is retried by the queue
      throw error
    }

    if (!estimations?.length) {
      const error = new Error(`No route found for collat :  ${normalizedAccount.collatToken} `)
      ;(error as any).code = "NO_ROUTE"

      this.errors.push({
        action: "liquidation_execution",
        message: `No route found for collateral: ${normalizedAccount.collatToken}`,
        market: normalizedAccount.market as string,
      })
      await this.saveLiquidationExecutionError(loggedContext, error, normalizedAccount)
      await this.safeLogActionError("liquidation_execution", error as Error, loggedContext, {
        account: normalizedAccount,
        step: "no_route",
      })
      // Don't throw - route not found is a permanent failure that won't succeed on retry
      return
    }

    let successCount = 0
    const errors: Error[] = []

    for (let i = 0; i < estimations.length; i++) {
      const estimation = estimations[i]
      // Use minTgUSDOut directly from estimation
      // The retry slippage is already included in estimation.minTgUSDOut via estimateLiquidation.
      const minAmount = estimation.minTgUSDOut

      // Validate minAmount is positive and non-zero (required by contract)
      if (minAmount <= 0n) {
        const error = new Error(`Invalid minAmount: ${minAmount.toString()}. minTgUSDOut from estimation is invalid. This should not happen.`)
        ;(error as any).code = "INVALID_MIN_AMOUNT"

        this.errors.push({
          action: "liquidation_preparation",
          message: error.message.slice(0, 200),
          market: normalizedAccount.market as string,
        })

        await this.saveLiquidationExecutionError(loggedContext, error, normalizedAccount)
        await this.safeLogActionError("liquidation_preparation", error, loggedContext, {
          account: normalizedAccount,
          estimation,
          step: "invalid_min_amount",
        })
        errors.push(error)
        continue // Skip this estimation and try next one
      }

      try {
        const currentNonce = await provider.getTransactionCount(signerAddress, "pending")
        const marketContract = new Contract(normalizedAccount.market as Addressable, MarketExternalActionsAbi.abi, signer)

        const minCollatValueToLiquidate = this.calculateMinCollatValueToLiquidate(normalizedAccount)

        const tx = await marketContract.liquidate(
          {
            account: estimation.account,
            postLiquidate: {
              collatAmountToLiquidate: estimation.collatToLiquidate,
              minUsgOut: minAmount,
              maxUsgToBurn: MaxUint256,
              // Intentionally `0n` (do not raise): min collateral *value* is enforced only via `minCollatValueToLiquidate` below.
              minCollatAmountToLiquidate: normalizedAccount.collateralBalance,
              isReceiptOut: false,
            },
            minCollatValueToLiquidate,
          },
          {
            router: estimation.liquidationCall.routerAddress,
            routerCall: estimation.liquidationCall.routerCall,
          },
          {
            nonce: currentNonce,
          }
        )
        const receipt = await tx.wait() // Wait for the transaction to be mined
        const executionResult = this.parseLiquidateEvent(receipt, normalizedAccount.market as string, addresses.tokens.USG, signerAddress)
        await this.saveLiquidationExecution(normalizedAccount, loggedContext, executionResult ?? undefined)
        successCount++
      } catch (error) {
        this.errors.push({ action: "liquidation_execution", message: (error as Error)?.message.slice(0, 100), market: normalizedAccount.market as string })

        await this.saveLiquidationExecutionError(loggedContext, error as Error, normalizedAccount)
        await this.safeLogActionError("liquidation_execution", error as Error, loggedContext, {
          account: normalizedAccount,
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
      const errorMessage = `All ${errors.length} liquidation transaction(s) failed. Last error: ${lastError.message.toString().slice(0, 100)}`
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
    // This should not happen if quote validation in estimateLiquidation worked correctly
    if (minAmount <= 0n) {
      throw new Error(`Invalid minAmount calculated: ${minAmount.toString()}. Quote: ${quote.toString()}, SlippageBps: ${slippageBps.toString()}`)
    }

    // Ensure BigInt values are properly converted (account may come from JSON with string values)
    const collateralBalanceBigInt = BigInt(account.collateralBalance)
    const positionValueBigInt = BigInt(account.positionValue)
    const userDebtBigInt = BigInt(account.userDebt)
    const healthRatioBigInt = BigInt(account.healthRatio)

    // Validate collateral balance and position value are positive
    if (collateralBalanceBigInt <= 0n) {
      throw new Error(`Invalid collateralBalance: ${collateralBalanceBigInt.toString()}`)
    }
    if (positionValueBigInt <= 0n) {
      throw new Error(`Invalid positionValue: ${positionValueBigInt.toString()}`)
    }

    // Create normalized account with BigInt values for use in RouterService
    const normalizedAccount: LiquidationUserFullInfo = {
      ...account,
      collateralBalance: collateralBalanceBigInt,
      positionValue: positionValueBigInt,
      userDebt: userDebtBigInt,
      healthRatio: healthRatioBigInt,
    }

    // Build router call data using RouterService
    let routerAddressForCall = routerAddress
    let data: string
    if (routerType === "enso") {
      const ensoCall = await this.routerService.buildEnsoRouterCallData(normalizedAccount, minAmount, signerAddress)
      data = ensoCall.routerCall
      routerAddressForCall = ensoCall.routerAddress
    } else {
      data = this.routerService.buildRouterCallData(route, normalizedAccount, minAmount, signerAddress, routerType, pendleData)
    }

    // Estimate gas for the liquidation transaction
    const marketContract = new Contract(normalizedAccount.market as Addressable, MarketExternalActionsAbi.abi, signer)
    let minCollatValueToLiquidate = 0n
    try {
      minCollatValueToLiquidate = this.calculateMinCollatValueToLiquidate(normalizedAccount)
      const params = [
        {
          account: account.account,
          postLiquidate: {
            collatAmountToLiquidate: MaxUint256,
            minUsgOut: minAmount,
            maxUsgToBurn: MaxUint256,

            // Intentionally `0n`, same as execution path — must match `liquidate` above.
            minCollatAmountToLiquidate: normalizedAccount.collateralBalance,
            isReceiptOut: false,
          },
          minCollatValueToLiquidate,
        },
        {
          // IMPORTANT: use the router that matches `routerCall` encoding.
          // Hardcoding the Pendle router here makes Curve routes revert with INVALID_SELECTOR during estimateGas.
          router: routerAddressForCall,
          routerCall: data,
        },
      ]
      const gasLimit = await marketContract.liquidate.estimateGas(params[0], params[1])

      // Get current gas price
      const feeData = await provider.getFeeData()
      // Ensure gasPrice is always BigInt - handle null values explicitly
      const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n
      // Ensure gasLimit is BigInt (should already be, but be explicit)
      const gasLimitBigInt = BigInt(gasLimit || 0)
      const gasCostWei = gasLimitBigInt * gasPrice
      const gasCostEth = Number(formatEther(gasCostWei))

      const grossProfit = quote - normalizedAccount.userDebt

      return {
        account: normalizedAccount.account,
        collatToLiquidate: MaxUint256,
        minTgUSDOut: minAmount,
        liquidationCall: {
          routerCall: data,
          routerAddress: routerAddressForCall,
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
      // Detects if gas estimation failed
      ;(enhancedError as any).isGasEstimationError = true
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
    const signerAddress = await signer.getAddress()

    // Get all viable routing candidates (custom Curve/Pendle + Enso), ordered by quote (highest first).
    const candidates = await this.routerService.getBestRoute(account, providerIndex, signerAddress, slippageBps)

    if (!candidates.length) {
      throw new Error(`No route found for collateral: ${account.collatToken}`)
    }

    // Try candidates best-first. If a candidate's gas estimation reverts (e.g. an Enso
    // route that quotes well but cannot execute), fall back to the next candidate within
    // the same attempt instead of failing the whole job and retrying the same route.
    let lastGasEstimationError: Error | undefined
    for (const candidate of candidates) {
      try {
        return await this.estimateCandidate(candidate, account, signer, provider, slippageBps, providerIndex)
      } catch (error) {
        // Fall back to the next candidate only on a gas-estimation revert. We key off the
        // `isGasEstimationError` flag (not `name`) because parseEthersError can overwrite
        // `name` with a decoded revert/error name (e.g. CALL_EXCEPTION).
        if ((error as any)?.isGasEstimationError) {
          lastGasEstimationError = error as Error
          console.warn(
            `Gas estimation failed for ${candidate.routerType} route on collateral ${account.collatToken}, trying next candidate: ${(error as Error).message}`
          )
          continue
        }
        // Non-gas-estimation errors (validation, insufficient recovered value, etc.) are real and must propagate.
        throw error
      }
    }

    // All candidates failed gas estimation — throw so the job is retried (price/liquidity may recover).
    const aggregatedError = new Error(
      `All ${candidates.length} routing candidate(s) failed gas estimation for collateral ${account.collatToken}. Last error: ${lastGasEstimationError?.message}`
    )
    aggregatedError.name = lastGasEstimationError?.name || "GasEstimationError"
    ;(aggregatedError as any).code = (lastGasEstimationError as any)?.code
    ;(aggregatedError as any).isGasEstimationError = true
    throw aggregatedError
  }

  /**
   * Build the estimation(s) for a single routing candidate, applying the Curve split-route
   * optimization where appropriate. Throws a `GasEstimationError` (via estimateTransaction)
   * if the candidate cannot be estimated, so the caller can fall back to another candidate.
   */
  private async estimateCandidate(
    candidate: RouteCandidate,
    account: LiquidationUserFullInfo,
    signer: Wallet,
    provider: JsonRpcProvider,
    slippageBps: bigint,
    providerIndex: number
  ): Promise<LiquidationEstimateInfo[]> {
    const { route, amount, priceImpact, routerType, routerAddress, pendleData } = candidate
    const userDebt = BigInt(account.userDebt)

    if (!route) {
      throw new Error(`No route found for collateral: ${account.collatToken}`)
    }

    // Validate that the route quote is positive (non-zero)
    if (!amount || amount <= 0n) {
      throw new Error(`Invalid route quote: ${amount.toString()}. Route found but quote is zero or negative for collateral: ${account.collatToken}`)
    }

    // For Curve routes with high price impact, try to split the liquidation
    // Note: Split routes are only supported for Curve, not Pendle
    if (routerType === "curve" && priceImpact > liquidationConfig.limits.maxPriceImpact) {
      const splittedRoutes = await this.routerService.getBestSplitCurveRoutes(account, providerIndex)
      if (splittedRoutes) {
        const {
          route1: { route: route1, info: info1, amount: amount1 },
          route2: { route: route2, info: info2, amount: amount2 },
          amountTotal: splittedAmountTotal,
        } = splittedRoutes || {}
        // is splitted profitable
        if (splittedAmountTotal > amount) {
          const computedSplitAmountTotal = amount1 + amount2
          if (computedSplitAmountTotal !== splittedAmountTotal) {
            const error = new Error(`Split route amount mismatch: amountTotal=${splittedAmountTotal.toString()}, sum=${computedSplitAmountTotal.toString()}`)
            ;(error as any).code = "INVALID_SPLIT_RECOVERED_VALUE"
            throw error
          }

          this.checkRecoveredValueCoversDebt(computedSplitAmountTotal, userDebt, "split")

          return [
            await this.estimateTransaction(route1 as LiquidationRoute, amount1, info1, signer, provider, slippageBps, routerType, routerAddress),
            await this.estimateTransaction(route2 as LiquidationRoute, amount2, info2, signer, provider, slippageBps, routerType, routerAddress),
          ]
        }
      }
    }

    this.checkRecoveredValueCoversDebt(amount, userDebt, "single")

    // Build the liquidation transaction data
    return [await this.estimateTransaction(route, amount, account, signer, provider, slippageBps, routerType, routerAddress, pendleData)]
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
    const addresses = await getAddressesJson()
    const collateralName =
      addresses.markets.find((market) => market.marketAddress.toLowerCase() === action.market.toString().toLowerCase())?.marketName || "Unknown"

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
        try {
          await this.executeSeizing(signer, action, logContext)
          await telegramNotifierService.sendMessage(`Seizing successful : ${collateralName.replace("-", "_")} (${formatEther(action.userDebt)})`)
        } catch (error) {
          await telegramNotifierService.sendError(
            `Seizing error : ${collateralName.replace("-", "_")} (${formatEther(action.userDebt)}) : ${(error as Error).message.slice(0, 100)}...`
          )
          throw error
        }
      } else if (action.type === "liquidation") {
        // Find wallet index for executeLiquidation (it still uses pkIndex)
        const walletIndex = this.context.walletsPks.findIndex((pk) => pk === walletsPk)
        if (walletIndex === -1) {
          throw new Error(`Wallet not found in context for private key`)
        }
        logContext.currentWalletIndex = walletIndex

        // executeLiquidation starts at 50 bps and increases slippage by 100 bps per retry:
        // 0.50% on the initial attempt, then 1.50%, 2.50%, etc.
        const attemptsMade = job.attemptsMade || 0
        const slippageStep = 100n
        const targetSlippageBps = 100n + BigInt(attemptsMade) * slippageStep
        // Convert retry count to the internal modifier used by executeLiquidation.
        const slippageModifierBps = attemptsMade > 0 ? (targetSlippageBps - slippageStep) * 1000n : 0n

        await this.executeLiquidation(walletIndex, action, slippageModifierBps, providerIndex, logContext)
        await telegramNotifierService.sendMessage(`Liquidation successful : ${collateralName.replace("-", "_")} (${formatEther(action.userDebt)})`)
      } else {
        throw new Error(`Unknown action type: ${(action as any).type}`)
      }
    } catch (error) {
      await telegramNotifierService.sendError(
        `Liquidation error : ${collateralName.replace("-", "_")} (${formatEther(action.userDebt)}) : ${(error as Error).message.slice(0, 100)}...`
      )
      // Re-throw to mark job as failed in Bull
      throw error
    }
  }
}
