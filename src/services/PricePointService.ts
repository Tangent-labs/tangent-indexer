import { PriceRepository } from "../db/PriceRepository"
import PointPricesAbi from "../abis/PointPrices.json"
import chainAddresses from "../addresses.json"

import { PriceApiInfo, PriceSource } from "type/data"

import { AddressLike, JsonRpcProvider } from "ethers"
import { chainView } from "utils/chainView"
import PriceApiService from "./PriceApiService"
import { MarketContractsRepository } from "../db/MarketContractsRepository"

const curvePoolType = "factory-stable-ng"

type PriceApiWarning = {
  apiName: string
  error: any
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
    // get the info from the database to process
    const priceSource = await this.priceRepository.getPriceSources()
    const markets = (await this.marketContractsRepository.getContracts())?.map((m) => m.contract_address.toLowerCase()) || []

    // set the promises to fetch the prices
    const promises = new Map<string, Promise<any>>()

    // We get all the price for the API
    const llamaPrice = priceSource.filter((p) => p.type === "llamaApi").map((p) => p.address.toLowerCase())
    const curvePrice = priceSource.filter((p) => p.type === "curveApi").map((p) => p.address.toLowerCase())
    const pendlePrice = priceSource.filter((p) => p.type === "pendleApi").map((p) => p.address.toLowerCase())

    if (llamaPrice.length > 0) {
      try {
        promises.set("Llama", this.priceApiService.getLlamaPrice(llamaPrice))
      } catch (error) {
        console.error("Error fetching llama price", error)
      }
    }
    if (curvePrice.length > 0) {
      try {
        promises.set("Curve", this.priceApiService.fetchCurveApiPrices(curvePrice, curvePoolType))
      } catch (error) {
        console.error("Error fetching curve price", error)
      }
    }

    if (pendlePrice.length > 0) {
      try {
        promises.set("Pendle", this.priceApiService.fetchPendleApiPrices(pendlePrice))
      } catch (error) {
        console.error("Error fetching pendle price", error)
      }
    }

    // Add ERC4626 processing to the promises
    const erc4626Addresses = priceSource.filter((p) => p.type === "ERC4626").map((p) => p.address.toLowerCase())
    if (erc4626Addresses.length > 0) {
      promises.set("ERC4626", this.processErc4626WithChainView(erc4626Addresses, markets, priceSource))
    }

    // Use Promise.allSettled to handle partial failures
    const promiseEntries = Array.from(promises.entries())
    // Run all promises
    const results = await Promise.allSettled(promiseEntries.map(([_, promise]) => promise))

    // Process all results in one pass
    const apiPrices: any[] = []
    const warnings: PriceApiWarning[] = []

    promiseEntries.forEach(([type, _], index) => {
      const result = results[index]

      if (result.status === "fulfilled") {
        // Add successful results
        if (Array.isArray(result.value)) {
          apiPrices.push(...result.value)
        } else {
          // Handle ERC4626 chain view result
          const chainViewPrices = result.value
          this.processErc4626Prices(priceSource, chainViewPrices, apiPrices)
          this.processDebtIndexes(chainViewPrices, apiPrices)
          apiPrices.push({
            address: chainAddresses.tokens.USG,
            price: Number(chainViewPrices.usgPrice) / 1e18,
          })
          apiPrices.push({
            address: chainAddresses.tokens.sUSG,
            price: Number(chainViewPrices.sUsgPrice) / 1e18,
          })
        }
      } else {
        // Collect warnings instead of logging
        warnings.push({
          apiName: type,
          error: result.reason,
        })
      }
    })

    return {
      prices: apiPrices?.flat() || [],
      warnings,
    }
  }

  async fetchPriceFeed() {
    const result = await this.getPriceFeeds()

    if (result?.prices?.length > 0) {
      this.insertPrices(result.prices)
    }

    return result
  }

  processDebtIndexes(chainViewPrices: PointServiceChainViewOut, apiPrices: PriceApiInfo[]) {
    chainViewPrices?.debtIndexes?.forEach((p) => {
      apiPrices.push({
        address: p.market,
        price: Number(p.index) / 1e18,
      })
    })
  }

  processErc4626Prices(priceSource: PriceSource[], chainViewPrices: PointServiceChainViewOut, apiPrices: PriceApiInfo[]) {
    if (!chainViewPrices?.ervc4626shares?.length) {
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
        if (priceObj) {
          // Shares is the amount of underlying assets per 1 share (scaled by 1e18)
          // Underlying price is in USD (decimal format)
          // erc4626Price = (shares * underlying USD price) / 1e18
          erc4626Price = Number((BigInt(p.shares) * BigInt(Math.floor(priceObj.price * 1e18))) / 10n ** 18n) / 1e18
        }
      }
      apiPrices.push({
        address: p.token,
        price: erc4626Price, // toString for consistency if BigInt is used
      })
    })
  }

  async processErc4626WithChainView(erc4626: string[], markets: string[], priceSource: any[]): Promise<PointServiceChainViewOut> {
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

  async insertPrices(prices: PriceApiInfo[]) {
    const newDate = new Date()
    return this.priceRepository.insertPriceFeed(
      prices.map((p) => ({
        token: p.address,
        timestamp: newDate,
        price_usd: p.price,
        address: p.address,
        price: p.price,
      }))
    )
  }
}
