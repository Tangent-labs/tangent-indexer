import { formatEther, formatUnits, JsonRpcProvider } from "ethers"
import { Prisma } from "@prisma/client"
import { COMMON_ERC20S, curveLpMapping } from "@tangent/defi-resources"

import { ERC20Repository } from "../../db/ERC20Repository.js"
import { MarketContractsRepository } from "../../db/MarketContractsRepository.js"

import { chainView } from "../../utils/chainView.js"

import GlobalDataChainview from "../../abis/GlobalDataChainview.json" with { type: "json" }
import {
  APR_TYPE,
  TVLAprs,
  Prices,
  CurveApiReturn,
  PendleApiReturn,
  ConvexFxnApiReturn,
  USGIndexingGlobalDataOut,
  USGInfoOut,
  CurveFactoryStableNGApiReturn,
  StakeDaoApiReturn,
} from "./types.js"
import { defiLLamaFetchPrices } from "./DefiLLamaPriceFetcher.js"
import { bigIntToNumber } from "../../utils/formatting.js"
import { NumMap } from "../../services/boost/types.js"

import { CallApiService } from "../CallApiService.js"
import { getAddressesJson } from "../../utils/jsonReader.js"

// TODO This is arbitraty, need a more dynamic version
// eslint-disable-next-line no-loss-of-precision
const ratioCrvToConvex = 221.80769230769230769230769230769

const rewardTokens = [
  { symbol: "CRV", address: COMMON_ERC20S.CRV },
  { symbol: "CVX", address: COMMON_ERC20S.CVX },
  { symbol: "FXN", address: COMMON_ERC20S.FXN },
  { symbol: "DINERO", address: "0x6df0e641fc9847c0c6fde39be6253045440c14d3" },
  { symbol: "GHO", address: COMMON_ERC20S.GHO },
  { symbol: "wstETH", address: COMMON_ERC20S.wstETH },
  { symbol: "PYUSD", address: COMMON_ERC20S.PYUSD },
  { symbol: "RLUSD", address: COMMON_ERC20S.RLUSD },
  { symbol: "USDS", address: COMMON_ERC20S.USDS },
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
  callApiService: CallApiService

  constructor(
    provider: JsonRpcProvider,
    callApiService: CallApiService,
    erc20Repository: ERC20Repository,
    marketContractsRepository: MarketContractsRepository
  ) {
    this.provider = provider
    this.callApiService = callApiService
    this.erc20Repository = erc20Repository
    this.marketContractsRepo = marketContractsRepository
  }

  async computeAprTvlsAndTotalSupplies() {
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
    const curveAPIData = await this.callApiService.fetchCurveApiData()

    // Fetch Curve stableSwap API data
    const curveStableSwapData = await this.callApiService.fetchCurveFactoryStableNg()

    // Fetch CONVEX FXN informations on their API
    const convexFXNAPIData = await this.callApiService.fetchConvexFXNApiData()

    // Fetch PENDLE markets informations on their API
    const pendleAPIData = await this.callApiService.fetchPendleApiData()

    // Fetch StakeDao markets informations on their API
    const stakeDaoAPIData = await this.callApiService.fetchStakeDao()

    const formattedMarketData = this.formatMarketData(
      markets,
      rawMarketData,
      formattedPrices,
      curveAPIData,
      curveStableSwapData,
      convexFXNAPIData,
      pendleAPIData,
      stakeDaoAPIData,
      now
    )

    return formattedMarketData
  }

  async fetchAndFormatTotalSupplies(usgInfos: USGInfoOut, now: Date) {
    const totalSupplyUSG = usgInfos.circulatingUsg
    const totalSupplysUSG = usgInfos.sUsgSupply

    const usgAndsUSG = await this.erc20Repository.getTrackedERC20In(["USG Tangent", "sUSG Tangent"])
    const usgRow = usgAndsUSG.find((erc20) => erc20.name === "USG Tangent")!
    const sUsgRow = usgAndsUSG.find((erc20) => erc20.name === "sUSG Tangent")!

    const totalSupplies: Prisma.total_suppliesUncheckedCreateInput[] = [
      { token_id: usgRow?.id, timestamp: now, total_supply: totalSupplyUSG.toString() },
      { token_id: sUsgRow?.id, timestamp: now, total_supply: totalSupplysUSG.toString() },
    ]

    return totalSupplies
  }

  async fetchGlobalDataChainview(markets: Markets[]) {
    const addresses = await getAddressesJson()

    const marketParams = markets.map((market) => {
      return [market.contract_address, market.contract_type]
    })

    // Retrieve the onchain data containing everything
    const globalData = (
      await chainView<[(string | number)[][], string, string, string, string, string[], string, string], USGIndexingGlobalDataOut[]>(
        this.provider,
        GlobalDataChainview.abi,
        GlobalDataChainview.bytecode,
        [
          marketParams,
          addresses.utilities.rewardAccumulator,
          addresses.utilities.irCalculator,
          addresses.tokens.USG,
          addresses.tokens.sUSG,
          [addresses.pegKeepers["USG-USDC"], addresses.pegKeepers["USG-wcrvUSD"]],
          addresses.oracles.USG,
          addresses?.utilities?.marketViewer,
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
      if (priceInfo) {
        const usdPerYear = Number(formatUnits(streamData.amountPerYear, priceInfo.decimals)) * priceInfo.price
        const key = rewardTokens.find((rewardToken) => rewardToken.address.toLowerCase() === rewardAddress.toLowerCase())!.symbol
        actualAPRs[key] = (usdPerYear * 100) / tvlTangent
      } else {
        console.error(`No priceInfo for ${rewardAddress}`)
      }
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
    curveStableSwapData: CurveFactoryStableNGApiReturn,
    convexFXNAPIData: ConvexFxnApiReturn,
    pendleAPIData: PendleApiReturn,
    stakeDaoAPIData: StakeDaoApiReturn,
    now: Date
  ) {
    // Iterates over all markets and hydrate them with data previously fetched through a reduce
    const formattedData: Prisma.market_global_dataUncheckedCreateInput[] = markets.map((market) => {
      // Find the corresponding market in the onchain data
      const aprTvlData = marketData.find((onChainData) => onChainData.globalData.marketAddress.toLowerCase() === market.contract_address.toLowerCase())!
      // Find the corresponding market in the onchain data
      const currentAPR = this.computeCurrentStreamedAPR(aprTvlData, formattedPrices)
      const projectedAPR: NumMap = {}

      const marketType = market.contract_type
      const collateralAddress = market.collateral_address.toLowerCase()

      // Convex CRV & FXN / StakeDao Vault / Curve Gauge
      if ([APR_TYPE["Convex CRV"], APR_TYPE["Convex FXN"], APR_TYPE["StakeDao Vault"], APR_TYPE["Curve Gauge"]].includes(marketType)) {
        if (curveAPIData?.data) {
          // Get the APY fees of curve LP
          let item = curveAPIData.data.poolList.find((pool: { address: string }) => pool.address.toLowerCase() === collateralAddress)
          if (!item) {
            const mappingRes = curveLpMapping.LPS[collateralAddress]
            // Maybe the LP is not the pool ( old Curve pool version), so we need to check it
            if (mappingRes) {
              const curvePool = mappingRes.curve_pool
              item = curveAPIData.data.poolList.find((pool: { address: string }) => pool.address.toLowerCase() === curvePool?.toLowerCase())
            }
          }
          currentAPR.APY = item!.latestWeeklyApy
          projectedAPR.APY = item!.latestWeeklyApy
        } else {
          console.error("No Curve API data for pool APY")
        }

        // Projected APR

        const underlyingTvl = Number(formatEther((aprTvlData.projectedAPR.totalSupplyUnderlying * aprTvlData.globalData.oraclePrice) / 10n ** 18n))

        // Convex CRV
        if (market.contract_type === APR_TYPE["Convex CRV"]) {
          const crvPriceInfo = formattedPrices[COMMON_ERC20S?.CRV.toLocaleLowerCase()]

          const usdPerYear = Number(formatUnits(aprTvlData.projectedAPR.streamingData[0].amountPerYear, crvPriceInfo.decimals)) * crvPriceInfo.price

          projectedAPR.CRV = (usdPerYear * 100) / underlyingTvl
          projectedAPR.CVX = projectedAPR.CRV / ratioCrvToConvex
        }
        // Convex FXN
        else if (market.contract_type === APR_TYPE["Convex FXN"]) {
          if (convexFXNAPIData?.pools) {
            const fxnData = convexFXNAPIData.pools.augmentedPoolData.find((cvxFxnPool: any) => {
              if (!cvxFxnPool?.curvePoolData) {
                return false
              }
              return cvxFxnPool?.curvePoolData?.address.toLowerCase() === market.collateral_address.toLowerCase()
            })!

            fxnData.rewardCoins.forEach((rewardCoin, i) => {
              const key = rewardTokens.find((rewardToken) => rewardToken.address.toLowerCase() === rewardCoin.address.toLowerCase())!.symbol
              projectedAPR[key] = fxnData.rewardAprs[i]
            })
          } else {
            console.error("No ConvexFXN API data ")
          }
        }

        // StakeDaoVault Gauge
        else if (market.contract_type === APR_TYPE["StakeDao Vault"]) {
          if (stakeDaoAPIData?.Vault) {
            const vaultData = stakeDaoAPIData?.Vault.find((data) => {
              const lpAddress = data.asset.address.toLowerCase()
              return lpAddress === collateralAddress
            })
            if (vaultData) {
              vaultData.gauge.aprDetails.forEach((rewards) => {
                const symbol = rewards.asset.symbol
                // If the symbol length is more than 7, we consider it's the LP itself, that we already saved in the projectedAPR object under the "APY" key
                // It's a dirty hack but an honnest working hack :D
                if (symbol.length < 7) {
                  projectedAPR[rewards.asset.symbol] = Number(rewards.apr) * 100
                }
              })
            } else {
              console.error(`Reward data for StakeDao vault ${collateralAddress} not found`)
            }
          } else {
            console.error(`Error in graphQL call to StakeDao`)
          }
        }

        // Curve Gauge
        else if (market.contract_type === APR_TYPE["Curve Gauge"]) {
          if (curveStableSwapData?.data) {
            const stableSwapData = curveStableSwapData.data.poolData.find((data) => data.address.toLowerCase() === collateralAddress)
            if (stableSwapData) {
              stableSwapData.gaugeRewards.forEach((rewards) => {
                projectedAPR[rewards.symbol] = rewards.apy
              })
            } else {
              console.error(`Reward data for Curve gauge not found`)
            }
          } else {
            console.error("Call to CurveStableSwapNG API failed")
          }
        }
      }

      // PENDLE PT
      else if (market.contract_type === APR_TYPE["Pendle PT"]) {
        if (pendleAPIData?.markets) {
          const item = pendleAPIData.markets.find((pendleMarket) => {
            const ptAddress = pendleMarket.pt.split("-")[1]
            return ptAddress.toLowerCase() === market.collateral_address.toLowerCase()
          })!

          const impliedApy = item?.details?.impliedApy * 100
          currentAPR["PT APY"] = impliedApy
          projectedAPR["PT APY"] = impliedApy
        } else {
          console.error("No PendleAPI data ")
        }
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
