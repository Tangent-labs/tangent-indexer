import { PriceInfo } from "type/data"
import { CurvePriceApiResult, LlamaPriceApiResult, PendlePriceApiResult } from "./globalData/types"
import axios from "axios"

export const CURVE_API = "https://api.curve.finance/api"

const PENDLE_PRICE_API = "https://api-v2.pendle.finance/core/v1/1/assets/prices"
const LLAMA_API = "https://coins.llama.fi/prices/current/"

class PriceApiService {
  async getLlamaPrice(addresses: string[]): Promise<PriceInfo[]> {
    if (!addresses?.length) {
      return []
    }
    try {
      const url = `${LLAMA_API}/${addresses.map((a) => "ethereum:" + a.toLowerCase()).join(",")}`

      const call = await axios.get<LlamaPriceApiResult>(url)
      const prices: PriceInfo[] = []

      for (const address of addresses) {
        if (call.data.coins["ethereum:" + address.toLowerCase()]) {
          prices.push({
            address,
            price: call.data.coins["ethereum:" + address.toLowerCase()].price,
          })
        } else {
          prices.push({
            address,
            price: 0,
          })
        }
      }
      return prices
    } catch (error) {
      console.error("error in getGeneralPrice", error)
      return []
    }
  }

  async fetchCurveApiPrices(addresses: string[], curvePoolType: string): Promise<PriceInfo[]> {
    if (!addresses?.length) {
      return []
    }
    try {
      const callUrl = `${CURVE_API}/getPools/ethereum/${curvePoolType}`
      const call = await axios.get<CurvePriceApiResult>(callUrl)
      const prices: PriceInfo[] = []

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
      return prices
    } catch (error) {
      console.error("error in fetchCurveApiPrices", error instanceof Error ? error.message : error)
      return []
    }
  }

  async fetchPendleApiPrices(addresses: string[]): Promise<PriceInfo[]> {
    if (!addresses?.length) {
      return []
    }

    try {
      const url = `${PENDLE_PRICE_API}?addresses=${addresses.map((a) => a.toLowerCase()).join(",")}`
      console.log("url", url)

      const call = await axios.get<PendlePriceApiResult>(url)
      const prices: PriceInfo[] = []

      for (const [address, price] of Object.entries(call.data.prices)) {
        prices.push({
          address,
          price,
        })
      }
      return prices
    } catch (error) {
      console.error("error in fetchPendleApiPrices", error instanceof Error ? error.message : error)
      return []
    }
  }
}

export default PriceApiService
