import axios from "axios"
import { CurverRegistry, PriceApiError, PriceApiInfo, PriceApiResult, PriceSource } from "../type/data.js"
import {
  BalancerPriceApiResult,
  ConvexFxnApiReturn,
  CurveApiReturn,
  CurveFactoryStableNGApiReturn,
  CurvePoolListApiResult,
  CurvePriceApiResult,
  LlamaPriceApiResult,
  PendleApiReturn,
  PendlePriceApiResult,
  SpectraApiResult,
  StakeDaoApiData,
  StakeDaoApiReturn,
} from "./globalData/types.js"

export const CURVE_API = "https://api.curve.finance/api"
const PENDLE_PRICE_API = "https://api-v2.pendle.finance/core/v1/1/assets/prices"
const BALANCER_GRAPHQL_API = "https://api-v3.balancer.fi/graphql"
const SPECTRA_API = "https://api.spectra.finance/v1/mainnet/pools"
const LLAMA_API = "https://coins.llama.fi/prices/current/"
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes in milliseconds

export class CallApiService {
  private ethPriceCache: { price: number; timestamp: number } | null = null

  async getEthPrice(): Promise<number> {
    const now = Date.now()

    // Check if cache is valid (less than 5 minutes old)
    if (this.ethPriceCache && now - this.ethPriceCache.timestamp < CACHE_TTL_MS) {
      return this.ethPriceCache.price
    }

    // Fetch new price and update cache
    const url = `${LLAMA_API}/ethereum:0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`
    const call = await axios.get<LlamaPriceApiResult>(url)
    const price = call.data.coins["ethereum:0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"]?.price || 0

    // Update cache
    this.ethPriceCache = {
      price,
      timestamp: now,
    }

    return price
  }

  async getLlamaPrice(addresses: string[]): Promise<PriceApiResult> {
    if (!addresses?.length) {
      return { prices: [] }
    }
    try {
      const url = `${LLAMA_API}/${addresses.map((a) => "ethereum:" + a.toLowerCase()).join(",")}`

      const call = await axios.get<LlamaPriceApiResult>(url)
      const prices: PriceApiInfo[] = []

      for (const address of addresses) {
        const price = call?.data?.coins["ethereum:" + address.toLowerCase()]?.price || 0
        prices.push({
          address,
          price,
        })
      }
      return { prices }
    } catch (error) {
      const apiError: PriceApiError = {
        api: "LlamaPriceAPi",
        reason: error instanceof Error ? error.message : "Unknown error",
        httpCode: axios.isAxiosError(error) && error.response ? error.response.status : undefined,
      }
      return { prices: [], error: apiError }
    }
  }

  async fetchCurveApiRegisty(addresses: string[]): Promise<{ address: string; type: CurverRegistry }[]> {
    addresses = addresses.map((a) => a.toLowerCase())
    const callUrl = `${CURVE_API}/getPoolList/ethereum`
    const call = await axios.get<CurvePoolListApiResult>(callUrl)
    if (!call.data.success) {
      console.error("Failed to fetch curve api registry", call.data)
      throw new Error("Failed to fetch curve api registry")
    }

    const returnValues = [] as { address: string; type: CurverRegistry }[]
    const list = call.data.data.poolList

    for (const p of list) {
      if (addresses.includes(p.address.toLowerCase())) {
        returnValues.push({ address: p.address, type: p.type as unknown as CurverRegistry })
      }
      if (returnValues.length === addresses.length) {
        break
      }
    }

    if (returnValues.length !== addresses.length) {
      console.error(
        "Not all addresses found in the curve registry",
        addresses.map((a) => !returnValues?.some((r) => r.address.toLowerCase() === a.toLowerCase())),
        returnValues
      )
    }

    return returnValues
  }

  async fetchCurveApiPrices(addresses: string[], curvePoolType: CurverRegistry): Promise<PriceApiResult> {
    if (!addresses?.length) {
      return { prices: [] }
    }
    try {
      const callUrl = `${CURVE_API}/getPools/ethereum/${curvePoolType}`
      const call = await axios.get<CurvePriceApiResult>(callUrl)
      const prices: PriceApiInfo[] = []

      // fin the prices we need in the results
      for (const p of call.data.data.poolData) {
        if (addresses.includes(p.address.toLowerCase())) {
          prices.push({
            address: p.address.toLowerCase(),
            price: p.totalSupply > 0 ? p.usdTotal / (p.totalSupply / 10 ** 18) : 0,
          })
          // if we have all the prices we need, break the loop
          if (prices.length === addresses.length) {
            break
          }
        }
      }
      return { prices }
    } catch (error) {
      const apiError: PriceApiError = {
        api: "CurvePriceApi",
        reason: error instanceof Error ? error.message : "Unknown error",
        httpCode: axios.isAxiosError(error) && error.response ? error.response.status : undefined,
      }
      return { prices: [], error: apiError }
    }
  }

  async fetchPendleApiPrices(addresses: string[]): Promise<PriceApiResult> {
    if (!addresses?.length) {
      return { prices: [] }
    }

    try {
      const url = `${PENDLE_PRICE_API}?addresses=${addresses.map((a) => a.toLowerCase()).join(",")}`

      const call = await axios.get<PendlePriceApiResult>(url)
      const prices: PriceApiInfo[] = []

      for (const [address, price] of Object.entries(call.data.prices)) {
        prices.push({
          address,
          price,
        })
      }
      return { prices }
    } catch (error) {
      const apiError: PriceApiError = {
        api: "PendlePriceApi",
        reason: error instanceof Error ? error.message : "Unknown error",
        httpCode: axios.isAxiosError(error) && error.response ? error.response.status : undefined,
      }
      return { prices: [], error: apiError }
    }
  }

  async fetchBalancerApiPrices(addresses: string[]): Promise<PriceApiResult> {
    if (!addresses?.length) {
      return { prices: [] }
    }

    try {
      // GraphQL query to get totalLiquidity and totalShares
      const query = `
        query GetPools($ids: [String!]!) {
          poolGetPools(where: { idIn: $ids, chainIn: [MAINNET] }) {
            address
            dynamicData {
              totalLiquidity
              totalShares
            }
          }
        }
      `

      // API call
      const call = await axios.post<BalancerPriceApiResult>(BALANCER_GRAPHQL_API, {
        query,
        variables: { ids: addresses.map((a) => a.toLowerCase()) },
      })

      const prices: PriceApiInfo[] = []

      // Iterates over all results if several LPs
      for (const pool of call.data.data.poolGetPools) {
        const totalLiquidity = Number(pool.dynamicData.totalLiquidity)
        const totalShares = Number(pool.dynamicData.totalShares)
        prices.push({
          address: pool.address.toLowerCase(),
          // 1LP = TotalLiquidity$ / TotalSupply
          price: totalShares > 0 ? totalLiquidity / totalShares : 0,
        })
      }
      return { prices }
    } catch (error) {
      const apiError: PriceApiError = {
        api: "BalancerPriceApi",
        reason: error instanceof Error ? error.message : "Unknown error",
        httpCode: axios.isAxiosError(error) && error.response ? error.response.status : undefined,
      }
      return { prices: [], error: apiError }
    }
  }

  async fetchSpectraApiPrices(sources: PriceSource[]): Promise<PriceApiResult> {
    if (!sources?.length) {
      return { prices: [] }
    }

    try {
      // Do the call 1 time
      const call = await axios.get<SpectraApiResult>(SPECTRA_API)

      // Sort spectra tokens per market (batch LP, PT and YT)
      const marketsByPt = new Map<string, (typeof call.data)[number]>()
      for (const market of call.data) {
        marketsByPt.set(market.address.toLowerCase(), market)
      }

      const prices: PriceApiInfo[] = []

      // Iterate over all tokens
      for (const source of sources) {
        const ptAddress = source.reference?.toLowerCase()
        // Shouldn't happen if seed is correct
        if (!ptAddress) {
          console.error("Link the token with it's PT in price_source")
          continue
        }
        // Find the matching market
        const market = marketsByPt.get(ptAddress)
        if (!market) {
          continue
        }

        const tokenAddress = source.address.toLowerCase()
        const pool = market.pools?.[0]

        let price: number | undefined
        if (tokenAddress === market.address.toLowerCase()) {
          // PT price
          price = pool?.ptPrice.usd
        } else if (pool && tokenAddress === pool.lpt.address.toLowerCase()) {
          // LP token price
          price = pool.lpt.price.usd
        } else if (tokenAddress === market.yt.address.toLowerCase()) {
          // YT hardcoded to 1
          price = 1
        }

        if (price !== undefined) {
          prices.push({ address: tokenAddress, price })
        }
      }

      return { prices }
    } catch (error) {
      const apiError: PriceApiError = {
        api: "SpectraPriceApi",
        reason: error instanceof Error ? error.message : "Unknown error",
        httpCode: axios.isAxiosError(error) && error.response ? error.response.status : undefined,
      }
      return { prices: [], error: apiError }
    }
  }

  async fetchCurveApiData() {
    // Fetch APY of curve LP on their API
    try {
      const response = await axios.get(CURVE_API + "/getSubgraphData/ethereum")
      const curveJson: CurveApiReturn = response.data
      return curveJson
    } catch (e) {
      const apiError: PriceApiError = {
        api: "CurvePriceApi",
        reason: e instanceof Error ? e.message : "Unknown error",
        httpCode: axios.isAxiosError(e) && e.response ? e.response.status : undefined,
      }
      return { error: apiError }
    }
  }

  async fetchCurveFactoryStableNg() {
    // Fetch APY of curve LP on their API
    try {
      const response = await axios.get(CURVE_API + "/getPools/ethereum/factory-stable-ng")
      const curveJson: CurveFactoryStableNGApiReturn = response.data
      return curveJson
    } catch (e) {
      const apiError: PriceApiError = {
        api: "CurvePriceApi",
        reason: e instanceof Error ? e.message : "Unknown error",
        httpCode: axios.isAxiosError(e) && e.response ? e.response.status : undefined,
      }
      return { error: apiError }
    }
  }

  async fetchStakeDao(): Promise<StakeDaoApiReturn> {
    // Fetch APY of curve LP on their API
    const STAKEDAO_ENDPOINT = "https://api.stakedao.org/api/strategies/v2/curve/"

    // Fetch APY of curve LP on their API
    try {
      const response = await axios.get(STAKEDAO_ENDPOINT)
      const curveJson: StakeDaoApiData[] = response.data
      return { data: curveJson }
    } catch (e) {
      console.error(e)
      const apiError = {
        api: "StakeDaoApi",
        reason: e instanceof Error ? e.message : "Unknown error",
        httpCode: axios.isAxiosError(e) && e.response ? e.response.status : undefined,
      }
      return { error: apiError }
    }
  }

  async fetchPendleApiData() {
    try {
      const PENDLE_API = "https://api-v2.pendle.finance/core/v1/1/markets/active"
      const pendleResponse = await axios.get(PENDLE_API)
      const pendleJson: PendleApiReturn = pendleResponse.data
      return pendleJson
    } catch (e) {
      const apiError: PriceApiError = {
        api: "PendlePriceApi",
        reason: e instanceof Error ? e.message : "Unknown error",
        httpCode: axios.isAxiosError(e) && e.response ? e.response.status : undefined,
      }
      console.error(apiError)
      return { error: apiError }
    }
  }

  async fetchConvexFXNApiData() {
    try {
      const CONVEX_FXN_API = "https://fx.convexfinance.com/api/fxp/pools"
      const convexFXNResponse = await axios.get(CONVEX_FXN_API)
      const cvxFxnJson: ConvexFxnApiReturn = convexFXNResponse.data
      return cvxFxnJson
    } catch (e) {
      const apiError: PriceApiError = {
        api: "ConvexFXNPriceApi",
        reason: e instanceof Error ? e.message : "Unknown error",
        httpCode: axios.isAxiosError(e) && e.response ? e.response.status : undefined,
      }
      return { error: apiError }
    }
  }
}
