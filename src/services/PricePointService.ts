import { AddressLike, JsonRpcProvider } from "ethers"

import { v4 as uuidv4 } from "uuid"
import { PriceRepository } from "../db/Points/PriceRepository.js"
import PointPricesAbi from "../abis/PointPrices.json" with { type: "json" }
import {
  PriceApiInfo,
  PriceSource,
  PriceApiResult,
  CurverRegistry,
  AddressesJson,
  NotificationMessage,
  POINTS_BOT_ACTIONS,
  NOTIFICATION_LEVEL,
} from "../type/data.js"

import { chainView } from "../utils/chainView.js"
import { PriceApiService } from "./PriceApiService.js"
import { MarketContractsRepository } from "../db/MarketContractsRepository.js"

const SCALE = 10n ** 18n

export type GetPriceFeedsResult = {
  prices: PriceApiInfo[]
  notifications: NotificationMessage[]
  date?: Date
  priceSourcePerAddress: { [address: string]: bigint }
}

type PointServiceChainViewOut = {
  erc4626shares: {
    token: string
    index: bigint
  }[]
  sUsgPrice: bigint
  usgPrice: bigint
  debtIndexes: {
    market: string
    index: bigint
  }[]
  timestamp: bigint
}

export class PricePointService {
  marketContractsRepository: MarketContractsRepository
  priceRepository: PriceRepository
  providers: JsonRpcProvider
  priceApiService: PriceApiService
  addresses: AddressesJson

  executionkey: string
  constructor(priceRepository: PriceRepository, marketContractsRepository: MarketContractsRepository, providers: JsonRpcProvider, addresses: AddressesJson) {
    this.priceRepository = priceRepository
    this.marketContractsRepository = marketContractsRepository
    this.providers = providers
    this.priceApiService = new PriceApiService()
    this.executionkey = uuidv4()
    this.addresses = addresses
  }

  async getPriceFeeds(): Promise<GetPriceFeedsResult> {
    const notifications: NotificationMessage[] = []
    // get the info from the database to process
    const priceSource = await this.priceRepository.getPriceSources()

    const priceSourcePerAddress: { [address: string]: bigint } = priceSource.reduce((acc, current) => {
      return {
        ...acc,
        [current.address]: current.id,
      }
    }, {})

    // get the markets from the database (=> checking debt indexes)
    const markets = (await this.marketContractsRepository.getContracts())?.map((m) => m.contract_address.toLowerCase()) || []

    // set the promises to fetch the prices
    const promises = new Map<string, Promise<any>>()

    // We get all the price for the API
    const llamaPrice = priceSource.filter((p) => p.type === "llamaApi").map((p) => p.address.toLowerCase())
    const curvePriceSources = priceSource.filter((p) => p.type === "curveApi")
    const pendlePrice = priceSource.filter((p) => p.type === "pendleApi").map((p) => p.address.toLowerCase())

    if (llamaPrice.length > 0) {
      promises.set("Llama", this.priceApiService.getLlamaPrice(llamaPrice))
    }

    // Group curve addresses by their reference (pool registry type) and make separate calls
    if (curvePriceSources.length > 0) {
      const curveGroups = new Map<string, string[]>()

      for (const source of curvePriceSources) {
        const registryType = source.reference // fallback to default

        // Add notification if no registry is specified and we're using the default
        if (!registryType) {
          const notification = {
            action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
            process: "Curve",
            error: {
              reason: `No registry specified for price source ${source.address}, skipping this price source`,
              api: "Curve",
            },
            level: NOTIFICATION_LEVEL.WARNING,
          }
          notifications.push(notification)
          continue
        }

        if (!curveGroups.has(registryType)) {
          curveGroups.set(registryType, [])
        }
        curveGroups.get(registryType)!.push(source.address.toLowerCase())
      }

      // Create separate promises for each registry type
      curveGroups.forEach((addresses, registryType) => {
        promises.set(`Curve-${registryType}`, this.priceApiService.fetchCurveApiPrices(addresses, registryType as CurverRegistry))
      })
    }

    if (pendlePrice.length > 0) {
      promises.set("Pendle", this.priceApiService.fetchPendleApiPrices(pendlePrice))
    }

    // Add ERC4626 processing to the promises
    const erc4626Addresses = priceSource.filter((p) => p.type === "ERC4626").map((p) => p.address.toLowerCase())
    promises.set("CHAINVIEW", this.callPriceChainView(erc4626Addresses, markets))

    // Use Promise.allSettled to handle partial failures
    const promiseEntries = Array.from(promises.entries())
    // Run all promises
    const results = await Promise.allSettled(promiseEntries.map(([_, promise]) => promise))

    // Process all results in one pass
    const apiPrices: PriceApiInfo[] = []
    let date: Date | undefined

    for (let i = 0; i < promiseEntries.length; i++) {
      const [type] = promiseEntries[i]
      const result = results[i]
      if (result.status === "fulfilled") {
        if (type === "CHAINVIEW") {
          date = await this.procesChainViewResults(result.value, priceSource, apiPrices, markets, notifications)
        } else {
          // Handle PriceApiResult objects from API services
          const apiResult = result.value as PriceApiResult
          if (apiResult && apiResult.prices && Array.isArray(apiResult.prices)) {
            apiPrices.push(...apiResult.prices)
          }
          // Collect any API errors as notifications
          if (apiResult?.error) {
            notifications.push({
              action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
              process: type,
              error: apiResult.error,
              level: NOTIFICATION_LEVEL.ERROR,
            })
          }
        }
      } else {
        console.error("error", result)
        // Collect notifications instead of logging
        const notification = {
          action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
          process: type,
          error: result.reason as Error,
          level: NOTIFICATION_LEVEL.ERROR,
        }
        notifications.push(notification)
      }
    }

    // Filter out any invalid price objects before returning
    const validPrices =
      apiPrices?.flat()?.filter((price) => {
        return price && typeof price === "object" && typeof price.address === "string" && typeof price.price === "number" && price.address.length > 0
      }) || []

    return {
      prices: validPrices.map((price) => {
        return {
          address: price.address.toLowerCase(),
          price: price.price,
        }
      }),
      notifications,
      date,
      priceSourcePerAddress,
    }
  }

  async procesChainViewResults(
    chainViewPrices: PointServiceChainViewOut,
    priceSources: PriceSource[],
    apiPrices: PriceApiInfo[],
    markets: string[],
    notifications: NotificationMessage[]
  ): Promise<Date | undefined> {
    if (!chainViewPrices) {
      notifications.push({
        action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
        process: "CHAINVIEW",
        error: new Error("No chain view data returned"),
        level: NOTIFICATION_LEVEL.ERROR,
      })
      return undefined
    }
    // Check if there are ERC4626 sources
    const erc4626Sources = priceSources.filter((p) => p.type === "ERC4626")
    const date = new Date(Number(chainViewPrices.timestamp) * 1000)

    // Only process USG/sUSG and debt indexes if there are ERC4626 sources
    if (erc4626Sources.length > 0) {
      // Handle ERC4626 chain view result
      this.processErc4626Prices(priceSources, chainViewPrices, apiPrices, notifications)

      const debtResult = this.processDebtIndexes(chainViewPrices, markets)

      // Add debt indexes prices
      if (debtResult?.prices && debtResult?.prices?.length > 0) {
        apiPrices.push(...debtResult.prices)
      }

      // Add USG price
      if (this.addresses?.tokens?.USG) {
        apiPrices.push({
          address: this.addresses.tokens.USG,
          price: Number(chainViewPrices.usgPrice) / Number(SCALE),
        })
      }
      // Add sUSG price
      if (this.addresses?.tokens?.sUSG) {
        apiPrices.push({
          address: this.addresses.tokens.sUSG,
          price: Number(chainViewPrices.sUsgPrice) / Number(SCALE),
        })
      }

      // Add notification if there are missing debt indexes for requested markets
      if (debtResult?.missingMarkets && debtResult?.missingMarkets?.length > 0) {
        const notification = {
          action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
          process: "DebtIndexes",
          error: new Error(`No debt index data returned for markets: ${debtResult?.missingMarkets?.join(", ")}`),
          level: NOTIFICATION_LEVEL.ERROR,
        }
        notifications.push(notification)
      }
    }
    return date
  }

  async fetchPriceFeed() {
    const result = await this.getPriceFeeds()

    if (result?.prices?.length > 0) {
      const date = result.date || new Date()

      const priceFeeds = result.prices.map((pf) => ({
        price_source_id: result.priceSourcePerAddress[pf.address],
        timestamp: date,
        price_usd: pf.price,
      }))

      await this.priceRepository.insertPriceFeed(priceFeeds)
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

  processErc4626Prices(priceSource: PriceSource[], chainViewPrices: PointServiceChainViewOut, apiPrices: PriceApiInfo[], notifications: NotificationMessage[]) {
    if (!chainViewPrices?.erc4626shares?.length) {
      notifications.push({
        action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
        process: "CHAINVIEW",
        error: new Error("No ERC4626 shares data returned"),
        level: NOTIFICATION_LEVEL.ERROR,
      })
      return
    }

    // from the share of ERC4626 we derive the price of the token
    chainViewPrices.erc4626shares.forEach(async (p: { token: string; index: bigint }) => {
      let erc4626Price = 0
      // Find the reference price config for this ERC4626 vault
      const refToken = priceSource.find((conf) => conf.address.toLowerCase() === p.token.toLowerCase())?.reference
      if (refToken) {
        // Find the USD price for the underlying asset
        const priceObj = apiPrices.find((x) => x.address.toLowerCase() === refToken.toLowerCase())
        if (!priceObj) {
          const notification = {
            action: POINTS_BOT_ACTIONS.POINTS_FETCH_PRICES,
            process: "CHAINVIEW",
            error: new Error(`No price found for reference token: ${refToken}`),
            level: NOTIFICATION_LEVEL.WARNING,
          }
          notifications.push(notification)
          return
        }
        if (priceObj) {
          // Shares is the amount of underlying assets per 1 share (scaled by 1e18)
          // Underlying price is in USD (decimal format)
          // erc4626Price = (shares * underlying USD price) / 1e18
          erc4626Price = Number((BigInt(p.index) * BigInt(Math.floor(priceObj.price * 1e18))) / SCALE) / 1e18
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
      usg: this.addresses.tokens.USG as AddressLike,
      usgOracle: this.addresses.oracles.USG as AddressLike,
      sUsg: this.addresses.tokens.sUSG as AddressLike,
      pegKeepers: Object.values(this.addresses.pegKeepers) as AddressLike[],
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
      usg: this.addresses.tokens.USG as AddressLike,
      usgOracle: this.addresses.oracles.USG as AddressLike,
      sUsg: this.addresses.tokens.sUSG as AddressLike,
      pegKeepers: Object.values(this.addresses.pegKeepers) as AddressLike[],
    }

    const p = await chainView<[AddressLike[], typeof addressParams, AddressLike[]], [PointServiceChainViewOut]>(
      this.providers,
      PointPricesAbi.abi,
      PointPricesAbi.bytecode,
      [erc4626, addressParams, markets]
    )

    return p?.at(0) as PointServiceChainViewOut
  }

  async updateCurvePriceSourceRegistry() {
    const priceSources = (await this.priceRepository.getPriceSources()).filter((p) => p.type === "curveApi" && !p.reference)

    if (!priceSources?.length) {
      return
    }

    const registries = await this.priceApiService.fetchCurveApiRegisty(priceSources.map((p) => p.address))
    await this.priceRepository.updateCurvePriceSourceRegistry(registries)
  }
}
