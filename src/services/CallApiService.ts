import { PriceApiInfo, PriceApiResult, PriceApiError, CurverRegistry } from "../type/data.js"
import {
  ConvexFxnApiReturn,
  CurveApiReturn,
  CurveFactoryStableNGApiReturn,
  CurvePoolListApiResult,
  CurvePriceApiResult,
  LlamaPriceApiResult,
  PendleApiReturn,
  PendlePriceApiResult,
  StakeDaoApiReturn,
} from "./globalData/types.js"
import axios from "axios"

export const CURVE_API = "https://api.curve.finance/api"
const PENDLE_PRICE_API = "https://api-v2.pendle.finance/core/v1/1/assets/prices"
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

  async fetchStakeDao() {
    //     const query = `
    //     query GetAllVaultsWithAssets {
    //       Vault {
    //         id
    //         chainId
    //         address
    //         protocolId
    //         asset {
    //           id
    //           name
    //           symbol
    //           address
    //           chainId
    //           decimals
    //           assetType
    //           components {
    //             childAsset {
    //               id
    //               name
    //               symbol
    //               address
    //               chainId
    //               decimals
    //               assetType
    //               components {
    //                 childAsset {
    //                   id
    //                   name
    //                   symbol
    //                   address
    //                   chainId
    //                   decimals
    //                   assetType
    //                 }
    //               }
    //             }
    //           }
    //         }
    //         gauge {
    //           address
    //           name
    //           symbol
    //           totalSupply
    //           totalSupplyUSD
    //           aprDetails {
    //             yieldType
    //             apr
    //             aprUSD
    //             asset {
    //               id
    //               name
    //               symbol
    //               decimals
    //               address
    //             }
    //           }
    //           metadata {
    //             id
    //             key
    //             value
    //             valueType
    //           }
    //         }
    //         rewardTokens {
    //           id
    //           asset {
    //             id
    //             symbol
    //           }
    //         }
    //         sidecar
    //         sidecarBalance
    //         rewardReceiver
    //         totalSupply
    //         totalSupplyUSD
    //       }
    //     }
    // `
    // Fetch APY of curve LP on their API
    try {
      // const response = await axios.post(
      //   "https://api-strategies.stakedao.org/v1/graphql",
      //   {
      //     query,
      //     operationName: "GetAllVaultsWithAssets",
      //   },
      //   {
      //     headers: {
      //       "Content-Type": "application/json",
      //     },
      //   }
      // )
      const response = await axios.get("https://api-staking-v2-worker.stakedao.org/api/rest/getallvaultswithassets")
      const data: StakeDaoApiReturn = response.data
      return data
    } catch (e) {
      const apiError: PriceApiError = {
        api: "StakeDaoApi",
        reason: e instanceof Error ? e.message : "Unknown error",
        httpCode: axios.isAxiosError(e) && e.response ? e.response.status : undefined,
      }
      console.error(apiError)
      return { error: apiError }
    }
  }

  async fetchPendleApiData() {
    try {
      const PENDLE_API = "https://api-v2.pendle.finance/core/v1/1/markets/active"
      const pendleResponse = await axios.get(PENDLE_API, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120",
          Accept: "application/json",
          "Accept-Language": "fr-FR,fr;q=0.9",
        },
      })
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
