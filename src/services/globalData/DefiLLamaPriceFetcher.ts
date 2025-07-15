import { Prices } from "./types"

export async function defiLLamaFetchPrices(tokens: string[]): Promise<Prices> {
  const DEFILLAMA_API = `https://coins.llama.fi/prices/current/${tokens.map((token) => `ethereum:${token}`)}?searchWidth=4h`
  const responsePrices = await fetch(DEFILLAMA_API)
  const jsonPrices = (await responsePrices.json()).coins

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
