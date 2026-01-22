import { AddressLike, Interface, JsonRpcProvider, ZeroAddress } from "ethers"
import { PENDLE_POOLS as PendlePools } from "@tangent/defi-resources"

import ICurveRouterAbi from "../abis/ICurveRouter.json" with { type: "json" }
import PendlePTRouterAbi from "../abis/PendlePTRouter.json" with { type: "json" }
import QuotesCurveRouterImpactAbi from "../abis/QuotesCurveRouterImpact.json" with { type: "json" }
import QuotePTToTokenAbi from "../abis/QuotePTToToken.json" with { type: "json" }
import successRoutesJson from "../../finalRoutes.json" with { type: "json" }

import { chainView } from "../utils/chainView.js"
import { getAddressesJson } from "../utils/jsonReader.js"
import {
  CurveQuote,
  LiquidationRoute,
  LiquidationUserFullInfo,
  PendlePoolConfig,
  PendlePTToSYQuote,
  QuotePTToTokenOut,
  QuotePTToTokenParams,
  RouteEvaluationResult,
  RouterType,
  SuccessRoutes,
} from "../type/data.js"
import { console } from "inspector"

const successRoutes = successRoutesJson as unknown as SuccessRoutes

// Default addresses for empty pool slots
const ZERO_POOLS: string[] = [ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress]

/**
 * RouterService handles routing logic for liquidations
 * Supports both Curve-only routes and Pendle+Curve hybrid routes
 */
export class RouterService {
  private curveRouterAddress: string
  private pendleRouterAddress: string
  private providers: JsonRpcProvider[]
  private pendleCollaterals: Set<string> = new Set()

  constructor(providers: JsonRpcProvider[], curveRouterAddress: string, pendleRouterAddress: string) {
    this.providers = providers
    this.curveRouterAddress = curveRouterAddress
    this.pendleRouterAddress = pendleRouterAddress
    this._initPendleCollaterals()
  }

  /**
   * Initialize the set of Pendle collateral addresses from PendlePools config
   */
  private _initPendleCollaterals(): void {
    for (const pool of Object.values(PendlePools)) {
      this.pendleCollaterals.add((pool as PendlePoolConfig).PT.toLowerCase())
    }
  }

  /**
   * Check if a collateral token is a Pendle PT token
   */
  public isPendleCollateral(collatToken: AddressLike): boolean {
    return this.pendleCollaterals.has((collatToken as string).toLowerCase())
  }

  /**
   * Determine which router type to use for a given collateral
   */
  public getRouterType(collatToken: AddressLike): RouterType {
    return this.isPendleCollateral(collatToken) ? "pendle" : "curve"
  }

  /**
   * Get the router address for a given collateral type
   */
  public getRouterAddress(collatToken: AddressLike): string {
    return this.isPendleCollateral(collatToken) ? this.pendleRouterAddress : this.curveRouterAddress
  }

  // ============================================
  // Unified Routing Methods
  // ============================================

  /**
   * Get the best route for a liquidation, automatically selecting Curve or Pendle
   */
  public async getBestRoute(
    info: LiquidationUserFullInfo,
    rpcIndex: number = 0
  ): Promise<RouteEvaluationResult & { routerType: RouterType; routerAddress: string; pendleData?: PendlePTToSYQuote }> {
    const routerType = this.getRouterType(info.collatToken)

    if (routerType === "pendle") {
      const result = await this._getBestPendleRoute(info, rpcIndex)
      return {
        ...result,
        routerType: "pendle",
        routerAddress: this.pendleRouterAddress,
        pendleData: result.pendleData,
      }
    } else {
      const result = await this._getBestCurveRoute(info, rpcIndex)
      return {
        ...result,
        routerType: "curve",
        routerAddress: this.curveRouterAddress,
      }
    }
  }

  /**
   * Build the encoded router call data for a liquidation
   */
  public buildRouterCallData(
    route: LiquidationRoute,
    info: LiquidationUserFullInfo,
    minAmountOut: bigint,
    receiver: string,
    routerType: RouterType,
    pendleData?: PendlePTToSYQuote
  ): string {
    if (routerType === "pendle" && pendleData) {
      return this._buildPendleRouterCallData(route, pendleData, minAmountOut, receiver)
    } else {
      return this._buildCurveRouterCallData(route, info.collateralBalance, minAmountOut, receiver)
    }
  }

  // ============================================
  // Curve Routing Methods
  // ============================================

  /**
   * Get the best Curve route for liquidation
   */
  private async _getBestCurveRoute(info: LiquidationUserFullInfo, rpcIndex: number = 0): Promise<RouteEvaluationResult> {
    const collatTokenLower = (info.collatToken as string).toLowerCase()
    const inputTokenRoutes = successRoutes.success[collatTokenLower]

    if (!inputTokenRoutes) {
      console.error("No Curve route found for collateral:", info.collatToken)
      return { route: null, amount: 0n, priceImpact: 0 }
    }

    // Flatten all routes for this input token across all output tokens
    const allRoutesMap = new Map<string, LiquidationRoute & { in: string }>()
    for (const routes of Object.values(inputTokenRoutes)) {
      for (const route of routes) {
        if (route?.display) {
          allRoutesMap.set(route.display, { ...route, in: collatTokenLower })
        }
      }
    }

    if (!allRoutesMap.size) {
      console.error("No Curve route found for collateral:", info.collatToken)
      return { route: null, amount: 0n, priceImpact: 0 }
    }

    return await this._evaluateCurveRoutes(Array.from(allRoutesMap.values()), info, rpcIndex)
  }

  /**
   * Evaluate multiple Curve routes and return the best one
   */
  private async _evaluateCurveRoutes(
    routes: (LiquidationRoute & { in: string })[],
    info: LiquidationUserFullInfo,
    rpcIndex: number = 0
  ): Promise<RouteEvaluationResult> {
    const routeParams: CurveQuote[] = routes.map((route) => ({
      _route: route.params.routeAddresses,
      _swap_params: route.params.swapParamsFull,
      _amount: info.collateralBalance,
      _pools: ZERO_POOLS,
    }))

    const quotes = (
      await chainView<[CurveQuote[]], { quote: bigint; priceImpact: bigint }[][]>(
        this.providers[rpcIndex],
        QuotesCurveRouterImpactAbi.abi,
        QuotesCurveRouterImpactAbi.bytecode,
        [routeParams]
      )
    )[0]

    const optimizedIndex = quotes.reduce((maxIdx, cur, idx, arr) => (cur.quote > (arr[maxIdx]?.quote ?? -1000000n) ? idx : maxIdx), 0)
    const param = routeParams[optimizedIndex]

    return {
      route: {
        display: routes[optimizedIndex].display,
        params: { routeAddresses: param._route, swapParamsFull: param._swap_params },
      },
      amount: quotes[optimizedIndex].quote,
      priceImpact: Number(quotes[optimizedIndex].priceImpact / 10n ** 15n) / 1000,
    }
  }

  /**
   * Get split routes for high price impact scenarios (Curve only)
   */
  public async getBestSplitCurveRoutes(
    account: LiquidationUserFullInfo,
    rpcIndex: number = 0
  ): Promise<
    | {
        route1: { route: LiquidationRoute | null; info: LiquidationUserFullInfo; amount: bigint }
        route2: { route: LiquidationRoute | null; info: LiquidationUserFullInfo; amount: bigint }
        amountTotal: bigint
        priceImpactTotal: number
      }
    | undefined
  > {
    const addresses = await getAddressesJson()
    const lps = Object.entries(addresses.lps).filter(([key]) => key.startsWith("USG-"))
    if (lps.length < 2) {
      return
    }

    const lp1 = lps[0]
    const lp2 = lps[1]
    const collatTokenLower = (account.collatToken as string).toLowerCase()

    const availableRoutes = Object.values(successRoutes.success[collatTokenLower] || {}).flat()
    if (availableRoutes?.length < 2) {
      return
    }

    const lp1Routes = availableRoutes.filter((route) => route.params.routeAddresses.includes(lp1[1])).map((route) => ({ ...route, in: collatTokenLower }))
    const lp2Routes = availableRoutes.filter((route) => route.params.routeAddresses.includes(lp2[1])).map((route) => ({ ...route, in: collatTokenLower }))

    if (lp1Routes?.length < 1 || lp2Routes?.length < 1) {
      return
    }

    const dataLp1 = { ...account, collateralBalance: account.collateralBalance / 2n }
    const dataLp2 = { ...account, collateralBalance: account.collateralBalance - dataLp1.collateralBalance }

    const [{ route: route1, amount: amount1, priceImpact: priceImpact1 }, { route: route2, amount: amount2, priceImpact: priceImpact2 }] = await Promise.all([
      this._evaluateCurveRoutes(lp1Routes, dataLp1, rpcIndex),
      this._evaluateCurveRoutes(lp2Routes, dataLp2, rpcIndex),
    ])

    return {
      route1: { route: route1, info: dataLp1, amount: amount1 },
      route2: { route: route2, info: dataLp2, amount: amount2 },
      amountTotal: amount1 + amount2,
      priceImpactTotal: (priceImpact1 + priceImpact2) / 2,
    }
  }

  /**
   * Build encoded Curve router exchange call data
   */
  private _buildCurveRouterCallData(route: LiquidationRoute, amount: bigint, minAmountOut: bigint, receiver: string): string {
    const iface = new Interface(ICurveRouterAbi.abi)
    return iface.encodeFunctionData("exchange", [route.params.routeAddresses, route.params.swapParamsFull, amount, minAmountOut, ZERO_POOLS, receiver])
  }

  // ============================================
  // Pendle Routing Methods
  // ============================================

  /**
   * Find the Pendle pool configuration for a given PT token
   */
  private _getPendlePoolForPT(ptAddress: string): PendlePoolConfig | undefined {
    const ptLower = ptAddress.toLowerCase()
    for (const pool of Object.values(PendlePools)) {
      if ((pool as PendlePoolConfig).PT.toLowerCase() === ptLower) {
        return pool as PendlePoolConfig
      }
    }
    return undefined
  }

  /**
   * Get the best Pendle route for liquidating PT → USG
   * This involves: PT → underlying (via Pendle) → USG (via Curve)
   */
  private async _getBestPendleRoute(info: LiquidationUserFullInfo, rpcIndex: number = 0): Promise<RouteEvaluationResult & { pendleData: PendlePTToSYQuote }> {
    const ptAddress = (info.collatToken as string).toLowerCase()
    const pendlePool = this._getPendlePoolForPT(ptAddress)
    console.log("_getBestPendleRoute", { pendlePool })
    if (!pendlePool) {
      console.error("No Pendle pool found for PT:", info.collatToken)
      return { route: null, amount: 0n, priceImpact: 0, pendleData: {} as PendlePTToSYQuote }
    }

    // For PT → Token (liquidation), we use UNDERLYING_OUT
    const underlyings = pendlePool.UNDERLYING_OUT

    console.log("_getBestPendleRoute", { underlyings })
    if (!underlyings || underlyings.length === 0) {
      console.error("No underlying tokens configured for PT:", info.collatToken)
      return { route: null, amount: 0n, priceImpact: 0, pendleData: {} as PendlePTToSYQuote }
    }

    // Build quote parameters for each underlying + curve route combination
    const params: QuotePTToTokenParams[] = []
    const routeInfos: { underlying: string; route: LiquidationRoute }[] = []

    for (const underlying of underlyings) {
      const underlyingLower = underlying.toLowerCase()
      // Find Curve routes from this underlying to USG or any output
      const curveRoutesForUnderlying = successRoutes.success[underlyingLower]
      console.log("_getBestPendleRoute", { curveRoutesForUnderlying })
      if (!curveRoutesForUnderlying) {
        continue
      }

      // Flatten routes for this underlying
      for (const routes of Object.values(curveRoutesForUnderlying)) {
        for (const route of routes) {
          console.log("route", { route })
          if (route?.display) {
            const ptToSYData: PendlePTToSYQuote = {
              market: pendlePool.MARKET,
              pt: pendlePool.PT,
              sy: pendlePool.SY,
              underlyingOut: underlying,
              ptAmount: info.collateralBalance,
            }
            console.log("_getBestPendleRoute", "params>push")
            params.push({
              ptToSYData,
              curveRouterData: {
                _route: route.params.routeAddresses,
                _swap_params: route.params.swapParamsFull,
                _pools: ZERO_POOLS,
              },
            })
            console.log("_getBestPendleRoute", "routeInfos>push")
            routeInfos.push({ underlying, route })
          }
        }
      }
    }

    if (params.length === 0) {
      console.error("No valid Pendle routes found for PT:", info.collatToken)
      return { route: null, amount: 0n, priceImpact: 0, pendleData: {} as PendlePTToSYQuote }
    }

    // Execute chainview to get quotes for all route combinations
    // chainView returns decoded!.args which is a tuple, so for error QuotePTToTokenError(QuotePtToTokenOut[] quotes)
    // it returns [quotes] where quotes is QuotePtToTokenOut[]

    const quotesRaw = (
      await chainView<[QuotePTToTokenParams[]], [QuotePTToTokenOut[]]>(this.providers[rpcIndex], QuotePTToTokenAbi.abi, QuotePTToTokenAbi.bytecode, [params])
    )[0]

    // Convert Result objects from ethers.js to plain JavaScript objects
    type WithToObject<T> = T & {
      toObject: () => T
    }
    const quotes: QuotePTToTokenOut[] = quotesRaw.map((quote: any) => ({
      ...(quote as unknown as WithToObject<QuotePTToTokenOut>).toObject(),
    }))

    // Find the best quote
    const optimizedIndex = quotes.reduce((maxIdx, cur, idx, arr) => (cur.quote > (arr[maxIdx]?.quote ?? 0n) ? idx : maxIdx), 0)

    const bestQuote = quotes[optimizedIndex]
    const bestRouteInfo = routeInfos[optimizedIndex]
    const bestParams = params[optimizedIndex]

    return {
      route: bestRouteInfo.route,
      amount: bestQuote.quote,
      priceImpact: Number(bestQuote.priceImpact / 10n ** 15n) / 1000,
      pendleData: bestParams.ptToSYData,
    }
  }

  /**
   * Build encoded Pendle router call data for PT → Token swap
   */
  private _buildPendleRouterCallData(route: LiquidationRoute, pendleData: PendlePTToSYQuote, minAmountOut: bigint, receiver: string): string {
    const pendlePool = this._getPendlePoolForPT(pendleData.pt)
    console.log("_buildPendleRouterCallData", pendlePool)
    if (!pendlePool) {
      throw new Error(`Pendle pool not found for PT: ${pendleData.pt}`)
    }

    const iface = new Interface(PendlePTRouterAbi.abi)

    // swapPTForToken(PendlePTToSY PTToSY, CurveRouterSwapNoAmount crvRouterData)
    const params = [
      {
        market: pendlePool.MARKET,
        pt: pendlePool.PT,
        sy: pendlePool.SY,
        yt: pendlePool.YT,
        underlyingOut: pendleData.underlyingOut,
        ptAmount: pendleData.ptAmount,
      },
      {
        _route: route.params.routeAddresses,
        _swap_params: route.params.swapParamsFull,
        _min_dy: 0n,
        _pools: ZERO_POOLS,
        _receiver: receiver,
      },
    ]
    return iface.encodeFunctionData("swapPTForToken", params)
  }
}
