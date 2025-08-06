import { formatEther, formatUnits, JsonRpcProvider } from "ethers"
import { MarketContractsRepository } from "db/MarketContractsRepository"
import { Prisma, PrismaClient } from "@prisma/client"
import { commonERC20, curveLpMapping } from "defi-resources"
import { chainView } from "utils/chainView"
import axios from "axios"

import * as usgContractAddresses from "../../addresses.json"
import * as MarketCurrentAPR from "../../abis/MarketCurrentAPR.json"
import { APR_TYPE, TVLAprs, Prices, KeyStringValueNumber, CurveApiReturn, PendleApiReturn, ConvexFxnApiReturn } from "./types"
import { defiLLamaFetchPrices, getPriceInfos } from "./DefiLLamaPriceFetcher"
import { bigIntToNumber } from "scripts/utils/formatting"

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

export class GlobalMarketDataService {
  marketContractsRepo: MarketContractsRepository
  provider: JsonRpcProvider

  constructor(prisma: PrismaClient, provider: JsonRpcProvider) {
    this.marketContractsRepo = new MarketContractsRepository(prisma)
    this.provider = provider
  }

  async fetchAndFormatData() {
    // Retrieve all markets indexed in the database
    const markets = (await this.marketContractsRepo.getContracts()).map((a) => {
      return { ...a, contract_type: APR_TYPE[a.contract_type] }
    })

    // Retrieve the onchain data containing everything
    const APRTvlData = (
      await chainView<[(string | number)[][], string, string], TVLAprs[][]>(this.provider, MarketCurrentAPR.abi, MarketCurrentAPR.bytecode, [
        markets.map((market) => {
          return [market.contract_address, market.contract_type]
        }),
        usgContractAddresses.utilities.rewardAccumulator,
        usgContractAddresses.utilities.irCalculator,
      ])
    )[0]

    // Fetch from DefiLlama prices of ERC20 tokens distributed in the underlying protocols
    const formattedPrices = await defiLLamaFetchPrices(rewardTokens.map((a) => a.address))

    // Fetch APY of curve LP on their API
    const CURVE_API = "https://api.curve.finance/api"
    const response = await axios.get(CURVE_API + "/getSubgraphData/ethereum")
    const curveJson: CurveApiReturn = response.data

    // Fetch PENDLE markets informations on their API
    const PENDLE_API = "https://api-v2.pendle.finance/core/v1/1/markets/active"
    const pendleResponse = await axios.get(PENDLE_API)
    const pendleJson: PendleApiReturn = pendleResponse.data

    // Fetch CONVEX FXN informations on their API
    const CONVEX_FXN_API = "https://fx.convexfinance.com/api/fxp/pools"
    const convexFXNResponse = await axios.get(CONVEX_FXN_API)
    const cvxFxnJson: ConvexFxnApiReturn = convexFXNResponse.data

    const now = new Date()

    // Iterates over all markets and hydrate them with data previously fetched through a reduce
    const formattedData: Prisma.market_global_dataUncheckedCreateInput[] = markets.map((market) => {
      // Find the corresponding market in the onchain data
      const aprTvlData = APRTvlData.find((onChainData) => onChainData.globalData.marketAddress === market.contract_address)!

      // Find the corresponding market in the onchain data
      const currentAPR = computeCurrentStreamedAPR(aprTvlData, formattedPrices)
      const projectedAPR: KeyStringValueNumber = {}

      if (market.contract_type === APR_TYPE["Convex CRV"] || market.contract_type === APR_TYPE["Convex FXN"]) {
        // Get the APY fees of curve LP
        let item = curveJson.data.poolList.find((pool: { address: string }) => pool.address === market.collateral_address)
        if (!item) {
          const mappingRes = curveLpMapping.LPS[market.collateral_address]
          if (mappingRes) {
            const curvePool = mappingRes.curve_pool
            item = curveJson.data.poolList.find((pool: { address: string }) => pool.address.toLowerCase() === curvePool?.toLowerCase())
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
          const data = cvxFxnJson.pools.augmentedPoolData.find((cvxFxnPool: any) => {
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
        const item = pendleJson.markets.find((pendleMarket) => {
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

function computeCurrentStreamedAPR(onchainData: TVLAprs, prices: Prices): KeyStringValueNumber {
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
