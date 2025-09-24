import { PriceRepository } from "../db/PriceRepository"
import PointPricesAbi from "../abis/PointPrices.json"
import chainAddresses from "../addresses.json"

import { PriceApiInfo, PriceSource, PriceApiResult, PriceApiError } from "type/data"

import { AddressLike, JsonRpcProvider } from "ethers"
import { chainView } from "utils/chainView"
import PriceApiService from "./PriceApiService"
import { MarketContractsRepository } from "../db/MarketContractsRepository"

const curvePoolType = "factory-stable-ng"
const SCALE = 10n ** 18n
type PriceApiWarning = {
  apiName: string
  error: PriceApiError | Error | any
}

type GetPriceFeedsResult = {
  prices: PriceApiInfo[]
  warnings: PriceApiWarning[]
}

type PointServiceChainViewOut = {
  ervc4626shares: {
    token: string
    shares: bigint
  }[]
  sUsgPrice: bigint
  usgPrice: bigint
  debtIndexes: {
    market: string
    index: bigint
  }[]
}

export class PricePointService {
  marketContractsRepository: MarketContractsRepository
  priceRepository: PriceRepository
  providers: JsonRpcProvider
  priceApiService: PriceApiService
  constructor(priceRepository: PriceRepository, marketContractsRepository: MarketContractsRepository, providers: JsonRpcProvider) {
    this.priceRepository = priceRepository
    this.marketContractsRepository = marketContractsRepository
    this.providers = providers
    this.priceApiService = new PriceApiService()
  }

  async getPriceFeeds(): Promise<GetPriceFeedsResult> {
    const warnings: PriceApiWarning[] = []
    // get the info from the database to process
    const priceSource = await this.priceRepository.getPriceSources()

    // get the markets from the database (=> checking debt indexes)
    const markets = (await this.marketContractsRepository.getContracts())?.map((m) => m.contract_address.toLowerCase()) || []

    // set the promises to fetch the prices
    const promises = new Map<string, Promise<any>>()

    // We get all the price for the API
    const llamaPrice = priceSource.filter((p) => p.type === "llamaApi").map((p) => p.address.toLowerCase())
    const curvePrice = priceSource.filter((p) => p.type === "curveApi").map((p) => p.address.toLowerCase())
    const pendlePrice = priceSource.filter((p) => p.type === "pendleApi").map((p) => p.address.toLowerCase())

    if (llamaPrice.length > 0) {
      promises.set("Llama", this.priceApiService.getLlamaPrice(llamaPrice))
    }
    if (curvePrice.length > 0) {
      promises.set("Curve", this.priceApiService.fetchCurveApiPrices(curvePrice, curvePoolType))
    }

    if (pendlePrice.length > 0) {
      promises.set("Pendle", this.priceApiService.fetchPendleApiPrices(pendlePrice))
    }

    // Add ERC4626 processing to the promises
    const erc4626Addresses = priceSource.filter((p) => p.type === "ERC4626").map((p) => p.address.toLowerCase())
    if (erc4626Addresses.length > 0) {
      promises.set("CHAINVIEW", this.callPriceChainView(erc4626Addresses, markets))
    }

    // Use Promise.allSettled to handle partial failures
    const promiseEntries = Array.from(promises.entries())
    // Run all promises
    const results = await Promise.allSettled(promiseEntries.map(([_, promise]) => promise))

    // Process all results in one pass
    const apiPrices: PriceApiInfo[] = []

    promiseEntries.forEach(([type, _], index) => {
      const result = results[index]

      if (result.status === "fulfilled") {
        if (type === "CHAINVIEW") {
          this.procesChainViewResults(result.value, priceSource, apiPrices, markets, warnings)
        } else {
          // Handle PriceApiResult objects from API services
          const apiResult = result.value as PriceApiResult
          if (apiResult && apiResult.prices && Array.isArray(apiResult.prices)) {
            apiPrices.push(...apiResult.prices)
          }
          // Collect any API errors as warnings
          if (apiResult?.error) {
            warnings.push({
              apiName: type,
              error: apiResult.error,
            })
          }
        }
      } else {
        // Collect warnings instead of logging
        warnings.push({
          apiName: type,
          error: result.reason,
        })
      }
    })

    // Filter out any invalid price objects before returning
    const validPrices =
      apiPrices?.flat()?.filter((price) => {
        return price && typeof price === "object" && typeof price.address === "string" && typeof price.price === "number" && price.address.length > 0
      }) || []

    return {
      prices: validPrices,
      warnings,
    }
  }

  async procesChainViewResults(
    chainViewPrices: PointServiceChainViewOut,
    priceSource: PriceSource[],
    apiPrices: PriceApiInfo[],
    markets: string[],
    warnings: PriceApiWarning[]
  ) {
    // Handle ERC4626 chain view result

    this.processErc4626Prices(priceSource, chainViewPrices, apiPrices, warnings)

    const debtResult = this.processDebtIndexes(chainViewPrices, markets)

    // Add debt indexes prices
    if (debtResult?.prices && debtResult?.prices?.length > 0) {
      apiPrices.push(...debtResult.prices)
    }

    // Add USG price
    if (chainAddresses?.tokens?.USG) {
      apiPrices.push({
        address: chainAddresses.tokens.USG,
        price: Number(chainViewPrices.usgPrice) / Number(SCALE),
      })
    }
    // Add sUSG price
    if (chainAddresses?.tokens?.sUSG) {
      apiPrices.push({
        address: chainAddresses.tokens.sUSG,
        price: Number(chainViewPrices.sUsgPrice) / Number(SCALE),
      })
    }

    // Add warning if there are missing debt indexes for requested markets

    if (debtResult?.missingMarkets && debtResult?.missingMarkets?.length > 0) {
      warnings.push({
        apiName: "DebtIndexes",
        error: new Error(`No debt index data returned for markets: ${debtResult?.missingMarkets?.join(", ")}`),
      })
    }
  }

  async fetchPriceFeed() {
    const result = await this.getPriceFeeds()

    if (result?.prices?.length > 0) {
      await this.priceRepository.insertPriceFeed(result.prices)
    }
    return result
  }

  rayToDecimal(ray: bigint | string): number {
    const RAY = 1000000000000000000000000000n // 10^27

    const value = typeof ray === "bigint" ? ray : BigInt(ray)

    // Split into integer and fractional parts
    const integerPart = value / RAY
    const fractionalPart = value % RAY

    // Convert fractional part to decimal string
    const fractionalStr = fractionalPart.toString().padStart(27, "0")

    // Remove trailing zeros for cleaner output
    const trimmedFractional = fractionalStr.replace(/0+$/, "")
    if (trimmedFractional === "") {
      return Number(integerPart.toString())
    }
    return parseFloat(`${integerPart}.${trimmedFractional}`)
  }

  processDebtIndexes(chainViewPrices: PointServiceChainViewOut, requestedMarkets?: string[]): { missingMarkets: string[] | undefined; prices: PriceApiInfo[] } {
    const result = { missingMarkets: [] as string[] | undefined, prices: [] as PriceApiInfo[] }
    const proceedMarkets = [] as string[]

    result.prices =
      chainViewPrices?.debtIndexes?.map((p) => {
        proceedMarkets.push(p.market.toLowerCase())
        return {
          address: p.market.toLowerCase(),
          price: this.rayToDecimal(p.index),
        }
      }) || []
    result.missingMarkets = requestedMarkets?.filter((market) => !proceedMarkets.includes(market.toLowerCase())) || []
    return result
  }

  processErc4626Prices(priceSource: PriceSource[], chainViewPrices: PointServiceChainViewOut, apiPrices: PriceApiInfo[], warnings: PriceApiWarning[]) {
    if (!chainViewPrices?.ervc4626shares?.length) {
      warnings.push({
        apiName: "CHAINVIEW",
        error: new Error("No ERC4626 shares data returned"),
      })
      return
    }

    // from the share of ERC4626 we derive the price of the token
    chainViewPrices.ervc4626shares.forEach((p: { token: string; shares: bigint }) => {
      let erc4626Price = 0
      // Find the reference price config for this ERC4626 vault
      const refToken = priceSource.find((conf) => conf.address.toLowerCase() === p.token.toLowerCase())?.ref_token
      if (refToken) {
        // Find the USD price for the underlying asset
        const priceObj = apiPrices.find((x) => x.address.toLowerCase() === refToken.toLowerCase())
        if (!priceObj) {
          warnings.push({
            apiName: "CHAINVIEW",
            error: new Error(`No price found for reference token: ${refToken}`),
          })
          return
        }
        if (priceObj) {
          // Shares is the amount of underlying assets per 1 share (scaled by 1e18)
          // Underlying price is in USD (decimal format)
          // erc4626Price = (shares * underlying USD price) / 1e18
          erc4626Price = Number((BigInt(p.shares) * BigInt(Math.floor(priceObj.price * 1e18))) / SCALE) / 1e18
        }
      }

      apiPrices.push({
        address: p.token,
        price: erc4626Price, // toString for consistency if BigInt is used
      })
    })
  }

  async callPriceChainView(erc4626: string[], markets: string[]): Promise<PointServiceChainViewOut> {
    const addressParams = {
      usg: chainAddresses.tokens.USG as AddressLike,
      usgOracle: chainAddresses.oracles.USG as AddressLike,
      sUsg: chainAddresses.tokens.sUSG as AddressLike,
      pegKeepers: Object.values(chainAddresses.pegKeepers) as AddressLike[],
    }

    const p = await chainView<[AddressLike[], typeof addressParams, AddressLike[]], [PointServiceChainViewOut]>(
      this.providers,
      PointPricesAbi.abi,
      PointPricesAbi.bytecode,
      [erc4626, addressParams, markets]
    )

    return p?.at(0) as PointServiceChainViewOut
  }

  async chainViewPrices(erc4626: string[], markets: string[]): Promise<PointServiceChainViewOut> {
    const addressParams = {
      usg: chainAddresses.tokens.USG as AddressLike,
      usgOracle: chainAddresses.oracles.USG as AddressLike,
      sUsg: chainAddresses.tokens.sUSG as AddressLike,
      pegKeepers: Object.values(chainAddresses.pegKeepers) as AddressLike[],
    }

    const p = await chainView<[AddressLike[], typeof addressParams, AddressLike[]], [PointServiceChainViewOut]>(
      this.providers,
      PointPricesAbi.abi,
      PointPricesAbi.bytecode,
      [erc4626, addressParams, markets]
    )

    return p?.at(0) as PointServiceChainViewOut
  }
}
