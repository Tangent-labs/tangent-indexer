import axios from "axios"
import { Prices } from "./types.js"

export async function defiLLamaFetchPricesCurrent(tokens: string[]): Promise<Prices> {
  const DEFILLAMA_API = `https://coins.llama.fi/prices/current/${tokens.map((token) => `ethereum:${token}`)}?searchWidth=4h`
  const responsePrices = await axios.get(DEFILLAMA_API)
  const jsonPrices = responsePrices.data.coins

  return Object.keys(jsonPrices).reduce(
    (acc, key) => ({
      ...acc,
      ...{ [key.split(":")[1].toLocaleLowerCase()]: jsonPrices[key] },
    }),
    {}
  )
}

export async function defiLLamaFetchPricesHistorical(timestamp: number, tokens: string[], searchWidth: number): Promise<Prices> {
  const DEFILLAMA_API = `https://coins.llama.fi/prices/historical/${timestamp}/${tokens.map((token) => `ethereum:${token}`)}?searchWidth=${searchWidth}h`
  const responsePrices = await axios.get(DEFILLAMA_API)
  const jsonPrices = responsePrices.data.coins

  return Object.keys(jsonPrices).reduce(
    (acc, key) => ({
      ...acc,
      ...{ [key.split(":")[1].toLocaleLowerCase()]: jsonPrices[key] },
    }),
    {}
  )
}

export function getPriceInfos(formattedPrices: Prices, token: string) {
  if (formattedPrices[token.toLowerCase()]) {
    return formattedPrices[token.toLowerCase()]
  } else {
    console.error(`No price for ${token}`)
    return undefined
  }
}
