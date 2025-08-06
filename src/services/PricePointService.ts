import { PriceRepository } from "../db/PriceRepository"
import PointPricesAbi from "../abis/PointPrices.json"
import chainAddresses from "../addresses.json"

import { PriceInfo, PriceSource } from "type/data"

import { AddressLike, JsonRpcProvider } from "ethers"
import { chainView } from "utils/chainView"
import PriceApiService from "./PriceApiService"
import { MarketContractsRepository } from "../db/MarketContractsRepository"

const curvePoolType = "factory-stable-ng"

type PointServiceChainViewOut = {
  ervc4626shares: [
    {
      token: string
      shares: bigint
    },
  ]
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

  async fetchPriceFeed() {
    const priceSource = await this.priceRepository.getPriceSources()
    const markets = (await this.marketContractsRepository.getContracts())?.map((m) => m.contract_address.toLowerCase()) || []
    const promises = []

    // We get all the price for the API

    const llamaPrice = priceSource.filter((p) => p.type === "llamaApi").map((p) => p.address.toLowerCase())
    const curvePrice = priceSource.filter((p) => p.type === "curveApi").map((p) => p.address.toLowerCase())
    const pendlePrice = priceSource.filter((p) => p.type === "pendleApi").map((p) => p.address.toLowerCase())

    if (llamaPrice.length > 0) {
      try {
        promises.push(this.priceApiService.getLlamaPrice(llamaPrice))
      } catch (error) {
        console.error("Error fetching llama price", error)
      }
    }
    if (curvePrice.length > 0) {
      try {
        promises.push(this.priceApiService.fetchCurveApiPrices(curvePrice, curvePoolType))
      } catch (error) {
        console.error("Error fetching curve price", error)
      }
    }
    if (pendlePrice.length > 0) {
      try {
        promises.push(this.priceApiService.fetchPendleApiPrices(pendlePrice))
      } catch (error) {
        console.error("Error fetching pendle price", error)
      }
    }
    const apiPrices = (await Promise.all(promises)).flat() || []

    // We get the price for the chain VIEW
    const erc4626Addresses = priceSource.filter((p) => p.type === "ERC4626").map((p) => p.address.toLowerCase())

    const chainViewPrices = await this.chainViewPrices(erc4626Addresses, markets)
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

    return apiPrices || []
  }

  processDebtIndexes(chainViewPrices: PointServiceChainViewOut, apiPrices: PriceInfo[]) {
    chainViewPrices?.debtIndexes.forEach((p) => {
      apiPrices.push({
        address: p.market,
        price: Number(p.index) / 1e18,
      })
    })
  }

  processErc4626Prices(priceSource: PriceSource[], chainViewPrices: PointServiceChainViewOut, apiPrices: PriceInfo[]) {
    if (!chainViewPrices?.ervc4626shares?.length) {
      return
    }

    // from the share of ERC4626 we derive the price of the token
    chainViewPrices.ervc4626shares.forEach((p: { token: string; shares: bigint }) => {
      let erc4626Price = 0
      // Find the reference price config for this ERC4626 vault
      const refToken = priceSource.find((conf) => conf.address.toLowerCase() === p.token.toLowerCase())?.refToken
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

  async insertPrices(prices: PriceInfo[]) {
    return this.priceRepository.insertPriceFeed(prices)
  }
}
