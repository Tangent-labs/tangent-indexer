import { formatEther, formatUnits, JsonRpcProvider } from "ethers"
import { Prisma, PrismaClient } from "@prisma/client"
import { commonERC20, curveLpMapping } from "@tangent/defi-resources"

import { ERC20Repository } from "../../db/ERC20Repository.js"
import { MarketContractsRepository } from "../../db/MarketContractsRepository.js"

import { chainView } from "../../utils/chainView.js"

import GlobalDataChainview from "../../abis/GlobalDataChainview.json" with { type: "json" }
import { APR_TYPE, TVLAprs, Prices, CurveApiReturn, PendleApiReturn, ConvexFxnApiReturn, USGIndexingGlobalDataOut, USGInfoOut } from "./types.js"
import { defiLLamaFetchPrices, getPriceInfos } from "./DefiLLamaPriceFetcher.js"
import { bigIntToNumber } from "../../scripts/utils/formatting.js"
import { NumMap } from "../../services/boost/types.js"

import { PriceApiService } from "../../services/PriceApiService.js"
import { getAddressesJson } from "../../utils/jsonReader.js"

// TODO This is arbitraty, need a more dynamic version
// eslint-disable-next-line no-loss-of-precision
const ratioCrvToConvex = 221.80769230769230769230769230769

const rewardTokens = [
  { symbol: "CRV", address: commonERC20.CRV },
  { symbol: "CVX", address: commonERC20.CVX },
  { symbol: "FXN", address: commonERC20.FXN },
  { symbol: "DINERO", address: "0x6df0e641fc9847c0c6fde39be6253045440c14d3" },
  { symbol: "GHO", address: commonERC20.GHO },
  { symbol: "wstETH", address: commonERC20.wstETH },
]

type Markets = {
  contract_type: number
  id: bigint
  contract_name: string
  collateral_address: string
  contract_address: string
}
export class GlobalMarketDataService {
  erc20Repository: ERC20Repository
  marketContractsRepo: MarketContractsRepository
  provider: JsonRpcProvider
  priceApiService: PriceApiService

  constructor(prisma: PrismaClient, provider: JsonRpcProvider, priceApiService: PriceApiService) {
    this.erc20Repository = new ERC20Repository(prisma)
    this.marketContractsRepo = new MarketContractsRepository(prisma)
    this.provider = provider
    this.priceApiService = priceApiService
  }

  async computeAndStoreAprTvlsAndTotalSupplies() {
    // Retrieve all markets and their associated type
    const markets = await this.getAllMarkets()

    // Retrieve the onchain data containing market data + total supplies
    const onchainDatas = await this.fetchGlobalDataChainview(markets)

    const now = new Date(Number(onchainDatas.timestamp) * 1000)

    const marketsData = await this.fetchAndFormatMarketData(markets, onchainDatas.marketData, now)
    const totalSupplies = await this.fetchAndFormatTotalSupplies(onchainDatas.usgInfo, now)

    return { marketsData, totalSupplies, now }
  }

  //  MARKET DATA FETCHING AND FORMATTING

  async fetchAndFormatMarketData(markets: Markets[], rawMarketData: TVLAprs[], now: Date) {
    // Fetch from DefiLlama prices of ERC20 tokens distributed in the underlying protocols
    const formattedPrices = await defiLLamaFetchPrices(rewardTokens.map((a) => a.address))

    // Fetch Curve API data
    const curveAPIData = await this.priceApiService.fetchCurveApiData()

    // Fetch CONVEX FXN informations on their API
    const convexFXNAPIData = await this.priceApiService.fetchConvexFXNApiData()

    // Fetch PENDLE markets informations on their API
    const pendleAPIData = await this.priceApiService.fetchPendleApiData()

    // Verify if there is an error field in the API returns
    if ("error" in curveAPIData) {
      throw new Error(`Erreur dans fetchCurveApiData: ${curveAPIData.error.reason}`)
    }
    if ("error" in convexFXNAPIData) {
      throw new Error(`Erreur dans fetchConvexFXNApiData: ${convexFXNAPIData.error.reason}`)
    }
    if ("error" in pendleAPIData) {
      throw new Error(`Erreur dans fetchPendleApiData: ${pendleAPIData.error.reason}`)
    }

    const formattedMarketData = this.formatMarketData(markets, rawMarketData, formattedPrices, curveAPIData, convexFXNAPIData, pendleAPIData, now)

    return formattedMarketData
  }

  async fetchAndFormatTotalSupplies(usgInfos: USGInfoOut, now: Date) {
    const totalSupplyUSG = usgInfos.circulatingUsg
    const totalSupplysUSG = usgInfos.sUsgSupply

    const usgAndsUSG = await this.erc20Repository.getTrackedERC20In(["USG", "sUSG"])
    const usgRow = usgAndsUSG.find((erc20) => erc20.name === "USG")!
    const sUsgRow = usgAndsUSG.find((erc20) => erc20.name === "sUSG")!

    const totalSupplies: Prisma.total_suppliesUncheckedCreateInput[] = [
      { token_id: usgRow?.id, timestamp: now, total_supply: totalSupplyUSG.toString() },
      { token_id: sUsgRow?.id, timestamp: now, total_supply: totalSupplysUSG.toString() },
    ]

    return totalSupplies
  }

  async fetchGlobalDataChainview(markets: Markets[]) {
    const addresses = await getAddressesJson()

    // Retrieve the onchain data containing everything
    const globalData = (
      await chainView<[(string | number)[][], string, string, string, string, string[], string], USGIndexingGlobalDataOut[]>(
        this.provider,
        GlobalDataChainview.abi,
        GlobalDataChainview.bytecode,
        [
          markets.map((market) => {
            return [market.contract_address, market.contract_type]
          }),
          addresses.utilities.rewardAccumulator,
          addresses.utilities.irCalculator,
          addresses.tokens.USG,
          addresses.tokens.sUSG,
          [addresses.pegKeepers["USG-USDC"], addresses.pegKeepers["USG-wcrvUSD"]],
          addresses.oracles.USG,
        ]
      )
    )[0]

    return globalData
  }

  computeCurrentStreamedAPR(onchainData: TVLAprs, prices: Prices): NumMap {
    const tvlTangent = Number(formatEther(onchainData.globalData.totalStakedUSD))
    const actualAPRs: { [aprKey: string]: number } = {} // APY: item?.latestWeeklyApy
    onchainData.currentAPR.forEach((streamData) => {
      const rewardAddress = streamData.token.toLowerCase()
      const priceInfo = prices[rewardAddress]
      const usdPerYear = Number(formatUnits(streamData.amountPerYear, priceInfo.decimals)) * priceInfo.price
      const key = rewardTokens.find((rewardToken) => rewardToken.address.toLowerCase() === rewardAddress.toLowerCase())!.symbol
      actualAPRs[key] = (usdPerYear * 100) / tvlTangent
    })
    return actualAPRs
  }

  async getAllMarkets() {
    // Retrieve all markets indexed in the database
    const markets = (await this.marketContractsRepo.getContracts()).map((a) => {
      return { ...a, contract_type: APR_TYPE[a.contract_type] }
    })

    return markets
  }

  formatMarketData(
    markets: Markets[],
    marketData: TVLAprs[],
    formattedPrices: Prices,
    curveAPIData: CurveApiReturn,
    convexFXNAPIData: ConvexFxnApiReturn,
    pendleAPIData: PendleApiReturn,
    now: Date
  ) {
    // Iterates over all markets and hydrate them with data previously fetched through a reduce
    const formattedData: Prisma.market_global_dataUncheckedCreateInput[] = markets.map((market) => {
      // Find the corresponding market in the onchain data
      const aprTvlData = marketData.find((onChainData) => onChainData.globalData.marketAddress.toLowerCase() === market.contract_address.toLowerCase())!
      // Find the corresponding market in the onchain data
      const currentAPR = this.computeCurrentStreamedAPR(aprTvlData, formattedPrices)
      const projectedAPR: NumMap = {}

      if (market.contract_type === APR_TYPE["Convex CRV"] || market.contract_type === APR_TYPE["Convex FXN"]) {
        // Get the APY fees of curve LP
        let item = curveAPIData.data.poolList.find((pool: { address: string }) => pool.address.toLowerCase() === market.collateral_address)
        if (!item) {
          const mappingRes = curveLpMapping.LPS[market.collateral_address]
          if (mappingRes) {
            const curvePool = mappingRes.curve_pool
            item = curveAPIData.data.poolList.find((pool: { address: string }) => pool.address.toLowerCase() === curvePool?.toLowerCase())
          }
        }

        currentAPR.APY = item!.latestWeeklyApy
        projectedAPR.APY = item!.latestWeeklyApy

        // Projected APR

        const underlyingTvl = Number(formatEther((aprTvlData.projectedAPR.totalSupplyUnderlying * aprTvlData.globalData.oraclePrice) / 10n ** 18n))

        // Convex CRV
        if (market.contract_type === APR_TYPE["Convex CRV"]) {
          // TODO Treat the no CvxRewardToken type

          const priceInfo = getPriceInfos(formattedPrices, commonERC20.CRV)
          const usdPerYear = Number(formatUnits(aprTvlData.projectedAPR.streamingData[0].amountPerYear, priceInfo!.decimals)) * priceInfo!.price

          projectedAPR.CRV = (usdPerYear * 100) / underlyingTvl
          projectedAPR.CVX = projectedAPR.CRV / ratioCrvToConvex
        }

        // Convex FXN
        else {
          const data = convexFXNAPIData.pools.augmentedPoolData.find((cvxFxnPool: any) => {
            if (!cvxFxnPool?.curvePoolData) {
              return false
            }
            return cvxFxnPool?.curvePoolData?.address.toLowerCase() === market.collateral_address.toLowerCase()
          })!

          data.rewardCoins.forEach((rewardCoin, i) => {
            const key = rewardTokens.find((rewardToken) => rewardToken.address.toLowerCase() === rewardCoin.address.toLowerCase())!.symbol
            projectedAPR[key] = data.rewardAprs[i]
          })
        }
      }
      // PENDLE PT
      else if (market.contract_type === APR_TYPE["PENDLE PT"]) {
        const item = pendleAPIData.markets.find((pendleMarket) => {
          const ptAddress = pendleMarket.pt.split("-")[1]
          return ptAddress.toLowerCase() === market.collateral_address.toLowerCase()
        })!

        const impliedApy = item?.details?.impliedApy * 100
        currentAPR["PT APY"] = impliedApy
        projectedAPR["PT APY"] = impliedApy
      }

      return {
        market_id: market.id,
        timestamp: now,
        apr_current: currentAPR,
        apr_projected: projectedAPR,
        tvl_usd: bigIntToNumber(aprTvlData.globalData.totalStakedUSD, 18),
        tvl_amount: bigIntToNumber(aprTvlData.globalData.totalStakedAmount, 18),
        total_debt: bigIntToNumber(aprTvlData.globalData.totalDebt, 18),
        bad_debt: bigIntToNumber(aprTvlData.globalData.badDebt, 18),
        oracle_price: bigIntToNumber(aprTvlData.globalData.oraclePrice, 18),
        ir_apy: (Math.exp(bigIntToNumber(aprTvlData.globalData.irApr, 18)) - 1) * 100,
        reward_cut: bigIntToNumber(aprTvlData.globalData.rewardCut, 3),
      }
    })

    return formattedData
  }
}
