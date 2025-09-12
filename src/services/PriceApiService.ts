import { PriceApiInfo, PriceApiResult, PriceApiError } from "type/data"
import { CurvePriceApiResult, LlamaPriceApiResult, PendlePriceApiResult } from "./globalData/types"
import axios from "axios"

export const CURVE_API = "https://api.curve.finance/api"

const PENDLE_PRICE_API = "https://api-v2.pendle.finance/core/v1/1/assets/prices"
const LLAMA_API = "https://coins.llama.fi/prices/current/"

class PriceApiService {
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

  async fetchCurveApiPrices(addresses: string[], curvePoolType: string): Promise<PriceApiResult> {
    if (!addresses?.length) {
      return { prices: [] }
    }
    try {
      const callUrl = `${CURVE_API}/getPools/ethereum/${curvePoolType}`
      const call = await axios.get<CurvePriceApiResult>(callUrl)
      const prices: PriceApiInfo[] = []

      // fin the prices we need in the results
      for (const p of call.data.data.poolData) {
        if (addresses.includes(p.address)) {
          prices.push({
            address: p.address,
            price: p.totalSupply > 0 ? p.usdTotal / p.totalSupply : 0,
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
}

export default PriceApiService
