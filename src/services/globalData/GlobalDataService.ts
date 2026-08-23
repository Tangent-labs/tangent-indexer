import { peg_monitored_tokens, Prisma } from "@prisma/client"
import { COMMON_ERC20S, curveLpMapping } from "@tangent/defi-resources"
import { formatEther, formatUnits, JsonRpcProvider } from "ethers"

import { ERC20Repository } from "../../db/ERC20Repository.js"
import { MarketContractsRepository } from "../../db/MarketContractsRepository.js"

import { chainView } from "../../utils/chainView.js"

import GlobalDataChainview from "../../abis/GlobalDataChainview.json" with { type: "json" }
import { NumMap } from "../../services/boost/types.js"
import { bigIntToNumber } from "../../utils/formatting.js"
import { defiLLamaFetchPricesCurrent } from "./DefiLLamaPriceFetcher.js"
import {
  APR_TYPE,
  ConvexFxnApiReturn,
  CurveApiReturn,
  CurveFactoryStableNGApiReturn,
  KeeperData,
  KeeperIn,
  PendleApiReturn,
  Prices,
  StakeDaoApiReturn,
  TVLAprs,
  USGContractsIn,
  USGIndexingGlobalDataOut,
  USGInfoOut,
  WStableData,
} from "./types.js"

import { GlobalHistoryDataRepository } from "../../db/GlobalHistoryDataRepository.js"
import { GlobalDataRepository } from "../../db/GlobalDataRepository.js"
import { PegKeeperRepository } from "../../db/PegKeepeerRepository.js"
import { PegMonitoredTokenRepository } from "../../db/PegMonitoredTokenRepository.js"
import { TotalSupplyRepository } from "../../db/TotalSupplyRepository.js"
import { WStableRepository } from "../../db/WStableRepository.js"
import { AddressesJson } from "../../type/data.js"
import { getAddressesJson } from "../../utils/jsonReader.js"
import { CallApiService } from "../CallApiService.js"
import { RevenuesService } from "../events/RevenuesService.js"

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
  { symbol: "DOLA", address: COMMON_ERC20S.DOLA },
  { symbol: "crvUSD", address: COMMON_ERC20S.crvUSD },
  { symbol: "USR", address: COMMON_ERC20S.USR },
  { symbol: "USDe", address: COMMON_ERC20S.USDe },
  { symbol: "USDC", address: COMMON_ERC20S.USDC },
  { symbol: "frxUSD", address: COMMON_ERC20S.frxUSD },
  { symbol: "YB", address: COMMON_ERC20S.YB },
  { symbol: "pmUSD", address: COMMON_ERC20S.pmUSD },
  { symbol: "BOLD", address: COMMON_ERC20S.BOLD },
]

const MAX_VOLATILE_PEG_PRICE_TIMESTAMP_SKEW_SECONDS = 5 * 60

type Markets = {
  contract_type: number
  id: bigint
  contract_name: string
  collateral_address: string
  contract_address: string
}
export class GlobalDataService {
  erc20Repository: ERC20Repository
  marketContractsRepo: MarketContractsRepository
  globalDataRepository: GlobalDataRepository
  totalSupplyRepository: TotalSupplyRepository
  pegKeeperRepository: PegKeeperRepository
  wStableRepository: WStableRepository
  globalHistoryDataRepository: GlobalHistoryDataRepository
  pegMonitoredTokenRepository: PegMonitoredTokenRepository
  provider: JsonRpcProvider
  callApiService: CallApiService
  revenuesService: RevenuesService

  constructor(
    provider: JsonRpcProvider,
    callApiService: CallApiService,
    erc20Repository: ERC20Repository,
    globalDataRepository: GlobalDataRepository,
    totalSupplyRepository: TotalSupplyRepository,
    pegKeeperRepository: PegKeeperRepository,
    wStableRepository: WStableRepository,
    globalHistoryDataRepository: GlobalHistoryDataRepository,
    marketContractsRepository: MarketContractsRepository,
    pegMonitoredTokenRepository: PegMonitoredTokenRepository,
    revenueService: RevenuesService
  ) {
    this.provider = provider
    this.callApiService = callApiService
    this.erc20Repository = erc20Repository
    this.globalDataRepository = globalDataRepository
    this.totalSupplyRepository = totalSupplyRepository
    this.pegKeeperRepository = pegKeeperRepository
    this.wStableRepository = wStableRepository
    this.globalHistoryDataRepository = globalHistoryDataRepository
    this.marketContractsRepo = marketContractsRepository
    this.pegMonitoredTokenRepository = pegMonitoredTokenRepository
    this.revenuesService = revenueService
  }

  async globalDataProcess() {
    // Retrieve all markets and their associated type
    const markets = await this.getAllMarkets()
    const pegKeepers = await this.pegKeeperRepository.getActiveKeepers()
    const wStables = await this.wStableRepository.getActiveWStables()
    const usgAddresses = await getAddressesJson()

    // Retrieve the onchain data containing market data + total supplies
    const onchainDatas = await this.fetchGlobalDataChainview(
      markets,
      usgAddresses,
      pegKeepers.map((k) => ({ keeper: k.address, lp: k.lp_address })),
      wStables.map((w) => w.address)
    )

    const now = new Date(Number(onchainDatas.timestamp) * 1000)

    // Fetch monitored tokens for peg sanity checks
    const monitoredTokens = await this.pegMonitoredTokenRepository.getActiveTokens()

    // Collect ref addresses (WETH, WBTC) needed for peg comparison
    const refAddresses = [...new Set(monitoredTokens.filter((t) => t.ref_address != null).map((t) => t.ref_address!))]
    const monitoredAddresses = monitoredTokens.map((t) => t.address)

    // Fetch from DefiLlama: reward tokens + collateral addresses (LPs) + monitored tokens + ref tokens
    const tokenAddresses = [
      ...new Set([...rewardTokens.map((a) => a.address), ...markets.map((m) => m.collateral_address), ...monitoredAddresses, ...refAddresses]),
    ]
    const prices = await defiLLamaFetchPricesCurrent(tokenAddresses)

    const {
      formattedData: marketsData,
      marketsTotalDeposited,
      marketsTotalBorrowed,
    } = await this.fetchAndFormatMarketData(markets, onchainDatas.marketData, now, prices)

    const oracleSanitySnapshots = this.buildOracleSanitySnapshots(markets, onchainDatas.marketData, prices, now)
    const pegSanitySnapshots = this.buildPegSanitySnapshots(monitoredTokens, prices, now)

    // Total Supplies of USG & sUSG
    const totalSupplies = await this.fetchAndFormatTotalSupplies(onchainDatas.usgInfo, now)
    const tvlsUSG = Number(formatEther(onchainDatas.usgInfo.usgStakedOnSgUsd)) * Number(formatEther(onchainDatas.usgInfo.UsgPrice))

    // PegKeepers TVL computation
    const { keepersSnapshot, keepersTVL } = this.computationTVLPegKeepers(
      onchainDatas.keepersData,
      pegKeepers,
      now,
      onchainDatas.usgInfo.UsgPrice,
      usgAddresses.tokens.USG,
      prices
    )

    // WStable TVL computation
    const { wStableSnapshot, wStablesTVL } = this.computationTVLWStables(onchainDatas.wStablesData, wStables, now, prices)

    const usgGlobalInfos: Prisma.usg_global_historyCreateInput = {
      date: now,
      tvl_markets: marketsTotalDeposited,
      tvl_susg: tvlsUSG,
      tvl_peg_keepers: keepersTVL,
      tvl_wstables: wStablesTVL,
      total_debt: marketsTotalBorrowed,
      total_tvl: marketsTotalDeposited + tvlsUSG + keepersTVL + wStablesTVL,
    }

    await this.revenuesService.computeRevenuesForRange(now, now)

    await this.insertOrUpdateGlobalData(
      marketsData,
      totalSupplies,
      keepersSnapshot,
      wStableSnapshot,
      usgGlobalInfos,
      oracleSanitySnapshots,
      pegSanitySnapshots,
      now
    )

    return { marketsData, totalSupplies, keepersSnapshot, wStableSnapshot, usgGlobalInfos }
  }

  private async insertOrUpdateGlobalData(
    marketsData: Prisma.market_global_dataUncheckedCreateInput[],
    totalSupplies: Prisma.total_suppliesCreateManyInput[],
    keepersData: Prisma.peg_keeper_historyCreateManyInput[],
    wStablesData: Prisma.wrapped_stable_historyCreateManyInput[],
    globalData: Prisma.usg_global_historyCreateInput,
    oracleSanitySnapshots: Prisma.oracle_sanity_snapshotsCreateManyInput[],
    pegSanitySnapshots: Prisma.peg_sanity_snapshotsCreateManyInput[],
    now: Date
  ) {
    const NEW_ROWS_FREQUENCY = 10_000

    // MARKETS DATA
    const lastUpdateTimeMarkets = await this.globalDataRepository.fetchLastExecutionTime()
    if (lastUpdateTimeMarkets && lastUpdateTimeMarkets.getTime() + NEW_ROWS_FREQUENCY > now.getTime()) {
      await this.globalDataRepository.updateRows(marketsData, lastUpdateTimeMarkets)
    } else {
      await this.globalDataRepository.insertRows(marketsData)
    }
    await this.globalDataRepository.wipeAndInsertLatestDataRows(marketsData)

    // TOTAL SUPPLIES DATA
    const lastUpdateTimeTotalSupplies = await this.totalSupplyRepository.fetchLastExecutionTime()
    if (lastUpdateTimeTotalSupplies && lastUpdateTimeTotalSupplies.getTime() + NEW_ROWS_FREQUENCY > now.getTime()) {
      await this.totalSupplyRepository.updateRows(totalSupplies, lastUpdateTimeTotalSupplies)
    } else {
      await this.totalSupplyRepository.insertRows(totalSupplies)
    }

    // PEG KEEPERS TVL
    const lastUpdateTimeKeepers = await this.pegKeeperRepository.fetchLastExecutionTime()
    if (lastUpdateTimeKeepers && lastUpdateTimeKeepers.getTime() + NEW_ROWS_FREQUENCY > now.getTime()) {
      await this.pegKeeperRepository.updatePegKeepersHistory(keepersData, lastUpdateTimeKeepers)
    } else {
      await this.pegKeeperRepository.insertNewPegKeepersHistory(keepersData)
    }

    // WSTABLES TVL

    const lastUpdateTimeWStables = await this.wStableRepository.fetchLastExecutionTime()
    if (lastUpdateTimeWStables && lastUpdateTimeWStables.getTime() + NEW_ROWS_FREQUENCY > now.getTime()) {
      await this.wStableRepository.updateWStablesHistory(wStablesData, lastUpdateTimeWStables)
    } else {
      await this.wStableRepository.insertNewWStablesHistory(wStablesData)
    }

    // GLOBAL HISTORY DATA
    const lastUpdateTimeGlobalRepositoryData = await this.globalHistoryDataRepository.fetchLastExecutionTime()
    if (lastUpdateTimeGlobalRepositoryData && lastUpdateTimeGlobalRepositoryData.getTime() + NEW_ROWS_FREQUENCY > now.getTime()) {
      await this.globalHistoryDataRepository.updateGlobalHistory([globalData], lastUpdateTimeGlobalRepositoryData)
    } else {
      await this.globalHistoryDataRepository.insertNewGlobalHistory([globalData])
    }

    // ORACLE SANITY SNAPSHOTS (oracle vs DefiLlama)
    const lastUpdateTimeOracle = await this.globalDataRepository.fetchLastOracleSanityTime()
    if (lastUpdateTimeOracle && lastUpdateTimeOracle.getTime() + NEW_ROWS_FREQUENCY > now.getTime()) {
      await this.globalDataRepository.updateOracleSanitySnapshots(oracleSanitySnapshots, lastUpdateTimeOracle)
    } else {
      await this.globalDataRepository.insertOracleSanitySnapshots(oracleSanitySnapshots)
    }

    // PEG SANITY SNAPSHOTS (token vs peg reference)
    const lastUpdateTimePeg = await this.globalDataRepository.fetchLastPegSanityTime()
    if (lastUpdateTimePeg && lastUpdateTimePeg.getTime() + NEW_ROWS_FREQUENCY > now.getTime()) {
      await this.globalDataRepository.updatePegSanitySnapshots(pegSanitySnapshots, lastUpdateTimePeg)
    } else {
      await this.globalDataRepository.insertPegSanitySnapshots(pegSanitySnapshots)
    }
  }

  private buildOracleSanitySnapshots(markets: Markets[], marketData: TVLAprs[], prices: Prices, now: Date): Prisma.oracle_sanity_snapshotsCreateManyInput[] {
    const rows: Prisma.oracle_sanity_snapshotsCreateManyInput[] = []
    for (const market of markets) {
      const onChain = marketData.find((md) => md.globalData.marketAddress.toLowerCase() === market.contract_address.toLowerCase())
      const offchainInfo = prices[market.collateral_address.toLowerCase()]
      if (!onChain || offchainInfo == null) continue
      const oraclePrice = bigIntToNumber(onChain.globalData.oraclePrice, 18)
      const offchainPrice = offchainInfo.price
      if (offchainPrice <= 0) continue
      const deviation_pct = (Math.abs(oraclePrice - offchainPrice) / offchainPrice) * 100
      rows.push({
        market_id: market.id,
        oracle_price: oraclePrice,
        offchain_price: offchainPrice,
        deviation_pct,
        timestamp: now,
      })
    }
    return rows
  }

  private buildPegSanitySnapshots(monitoredTokens: peg_monitored_tokens[], prices: Prices, now: Date): Prisma.peg_sanity_snapshotsCreateManyInput[] {
    const rows: Prisma.peg_sanity_snapshotsCreateManyInput[] = []

    for (const token of monitoredTokens) {
      const priceInfo = prices[token.address.toLowerCase()]
      if (priceInfo == null) continue

      const price = priceInfo.price
      let refPrice: number

      switch (token.peg_type) {
        case "USD":
          refPrice = 1.0
          break
        case "ETH":
        case "BTC": {
          if (token.ref_address == null) continue
          const refInfo = prices[token.ref_address.toLowerCase()]
          if (refInfo == null) continue
          if (Math.abs(priceInfo.timestamp - refInfo.timestamp) > MAX_VOLATILE_PEG_PRICE_TIMESTAMP_SKEW_SECONDS) continue
          refPrice = refInfo.price
          break
        }
        default:
          continue
      }

      if (refPrice <= 0) continue
      const deviation_pct = (Math.abs(price - refPrice) / refPrice) * 100

      rows.push({
        token_id: token.id,
        price,
        ref_price: refPrice,
        deviation_pct,
        timestamp: now,
      })
    }
    return rows
  }

  private computationTVLWStables(wStablesData: WStableData[], wStables: Prisma.wrapped_stableCreateManyInput[], now: Date, prices: Prices) {
    // Retrieve WStableIDS

    let wStablesTVL = 0
    const wStableSnapshot: Prisma.wrapped_stable_historyCreateManyInput[] = []
    wStablesData.forEach((w) => {
      const wStableID = wStables.find((ww) => ww.address.toLowerCase() === w.wStable.toLowerCase())?.id!
      const priceInfo = prices[w.stable.toLowerCase()]
      const totalSupply = Number(formatUnits(w.totalSupply, priceInfo.decimals))
      const totalValue = totalSupply * priceInfo.price

      wStablesTVL += totalValue
      wStableSnapshot.push({ wrapped_stable_id: wStableID, date: now, total_supply: totalSupply, total_value: totalValue })
    })

    return { wStableSnapshot, wStablesTVL }
  }

  private computationTVLPegKeepers(
    keepersData: KeeperData[],
    keepers: Prisma.peg_keeperCreateManyInput[],
    now: Date,
    usgPrice: bigint,
    usgAddress: string,
    prices: Prices
  ) {
    let keepersTVL = 0
    const keepersSnapshot: Prisma.peg_keeper_historyCreateManyInput[] = []
    keepersData.forEach((k) => {
      const keeperId = keepers.find((kk) => kk.address.toLowerCase() === k.keeper.toLowerCase())?.id!
      const lpBalance = Number(formatEther(k.lpBalance))
      const pUSG = Number(formatEther(usgPrice))

      const p0 = k.coin0.toLowerCase() === usgAddress.toLowerCase() ? pUSG : prices[k.coin0.toLowerCase()].price
      const p1 = k.coin1.toLowerCase() === usgAddress.toLowerCase() ? pUSG : prices[k.coin1.toLowerCase()].price

      const lowestP = p0 > p1 ? p1 : p0
      const totalValue = lowestP * Number(formatEther(k.virtualPrice)) * lpBalance

      keepersTVL += totalValue
      keepersSnapshot.push({ peg_keeper_id: keeperId, balance: lpBalance, total_value: totalValue, date: now })
    })

    return { keepersSnapshot, keepersTVL }
  }

  //  MARKET DATA FETCHING AND FORMATTING

  private async fetchAndFormatMarketData(markets: Markets[], rawMarketData: TVLAprs[], now: Date, formattedPrices: Prices) {
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

  private async fetchAndFormatTotalSupplies(usgInfos: USGInfoOut, now: Date) {
    const totalSupplyUSG = usgInfos.circulatingUsg
    const totalSupplysUSG = usgInfos.sUsgSupply

    const usgAndsUSG = await this.erc20Repository.getTrackedERC20In(["USG Tangent", "sUSG Tangent"])
    const usgRow = usgAndsUSG.find((erc20) => erc20.name === "USG Tangent")!
    const sUsgRow = usgAndsUSG.find((erc20) => erc20.name === "sUSG Tangent")!

    const totalSupplies: Prisma.total_suppliesCreateManyInput[] = [
      { token_id: usgRow?.id, timestamp: now, total_supply: totalSupplyUSG.toString() },
      { token_id: sUsgRow?.id, timestamp: now, total_supply: totalSupplysUSG.toString() },
    ]

    return totalSupplies
  }

  private async fetchGlobalDataChainview(markets: Markets[], usgAddresses: AddressesJson, keepersIn: KeeperIn[], wStables: string[]) {
    const marketParams = markets.map((market) => {
      return [market.contract_address, market.contract_type]
    })

    // Retrieve the onchain data containing everything
    const globalData = (
      await chainView<[(string | number)[][], USGContractsIn, KeeperIn[], string[]], USGIndexingGlobalDataOut[]>(
        this.provider,
        GlobalDataChainview.abi,
        GlobalDataChainview.bytecode,
        [
          marketParams,
          {
            rewardAccumulator: usgAddresses.utilities.rewardAccumulator,
            irCalculator: usgAddresses.utilities.irCalculator,
            usg: usgAddresses.tokens.USG,
            sUSG: usgAddresses.tokens.sUSG,
            usgOracle: usgAddresses.oracles.USG,
            _marketViewer: usgAddresses.utilities.marketViewer,
          } as USGContractsIn,
          keepersIn,
          wStables,
        ]
      )
    )[0]

    return globalData
  }

  private async getAllMarkets() {
    // Retrieve all markets indexed in the database
    const markets = (await this.marketContractsRepo.getContracts()).map((a) => {
      return { ...a, contract_type: APR_TYPE[a.contract_type] }
    })

    return markets
  }

  private formatMarketData(
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
    let marketsTotalDeposited = 0
    let marketsTotalBorrowed = 0
    // Iterates over all markets and hydrate them with data previously fetched through a reduce
    const formattedData: Prisma.market_global_dataUncheckedCreateInput[] = markets.map((market) => {
      // Find the corresponding market in the onchain data
      const aprTvlData = marketData.find((onChainData) => onChainData.globalData.marketAddress.toLowerCase() === market.contract_address.toLowerCase())!
      const rewardCut = bigIntToNumber(aprTvlData.globalData.rewardCut, 3)

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

        // Convex CRV
        // Call in the chainview to find weighted rate
        if (market.contract_type === APR_TYPE["Convex CRV"]) {
          const rewardStreamed = aprTvlData.projectedAPR.streamingData
          rewardStreamed.forEach((rs) => {
            const rewardInfos = formattedPrices[rs.token.toLowerCase()]
            if (rewardInfos) {
              const apr = (Number(formatUnits(rs.amount, rewardInfos.decimals)) * rewardInfos.price) / Number(formatEther(aprTvlData.globalData.oraclePrice))
              projectedAPR[rewardInfos.symbol] = apr * (100 - rewardCut)
            } else {
              console.error("No reward infos for " + rs.token)
            }
          })
        }
        // Convex FXN
        // Everything is retrieved from the API
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
              // Convex can list the same reward token several times (e.g. two FXN distributors on USDC/fxUSD):
              // accumulate instead of assigning, otherwise the last entry (possibly 0) overwrites the real APR.
              projectedAPR[key] = (projectedAPR[key] ?? 0) + fxnData.rewardAprs[i] * ((100 - rewardCut) / 100)
            })
          } else {
            console.error("No ConvexFXN API data ")
          }
        }

        // StakeDaoVault Gauge
        // Found in API
        else if (market.contract_type === APR_TYPE["StakeDao Vault"]) {
          const stakeDaoItem = stakeDaoAPIData.data?.find((item) => item.lpToken.address.toLowerCase() === collateralAddress.toLowerCase())
          if (stakeDaoItem && stakeDaoItem.apr) {
            const aprObject = stakeDaoItem.apr?.current
            aprObject.details.forEach((aprObject) => {
              if (!aprObject.label.includes("APY")) {
                projectedAPR[aprObject.label.split(" ")[0]] = aprObject.value[0] * ((100 - rewardCut) / 100)
              }
            })
          } else {
            console.error(`Error in graphQL call to StakeDao`)
          }
        }

        // Curve Gauge
        // Found rate on chain
        else if (market.contract_type === APR_TYPE["Curve Gauge"]) {
          if (curveStableSwapData?.data) {
            const stableSwapData = curveStableSwapData.data.poolData.find((data) => data.address.toLowerCase() === collateralAddress)
            if (stableSwapData) {
              stableSwapData.gaugeRewards.forEach((rewards) => {
                projectedAPR[rewards.symbol] = rewards.apy * ((100 - rewardCut) / 100)
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
      // Data given by Pendle API
      else if (market.contract_type === APR_TYPE["Pendle PT"]) {
        if (pendleAPIData?.markets) {
          const item = pendleAPIData.markets.find((pendleMarket) => {
            const ptAddress = pendleMarket.pt.split("-")[1]
            return ptAddress.toLowerCase() === market.collateral_address.toLowerCase()
          })!

          const impliedApy = item?.details?.impliedApy * 100
          currentAPR.APY = impliedApy
          projectedAPR.APY = impliedApy
        } else {
          console.error("No PendleAPI data ")
        }
      }

      const tvlMarket = bigIntToNumber(aprTvlData.globalData.totalStakedUSD, 18)
      const totalDebt = bigIntToNumber(aprTvlData.globalData.totalDebt, 18)
      const badDebt = bigIntToNumber(aprTvlData.globalData.badDebt, 18)

      marketsTotalDeposited += tvlMarket
      marketsTotalBorrowed += badDebt + totalDebt

      return {
        market_id: market.id,
        timestamp: now,
        apr_current: currentAPR,
        apr_projected: projectedAPR,
        tvl_usd: tvlMarket,
        tvl_amount: bigIntToNumber(aprTvlData.globalData.totalStakedAmount, 18),
        total_debt: totalDebt,
        bad_debt: badDebt,
        oracle_price: bigIntToNumber(aprTvlData.globalData.oraclePrice, 18),
        ir_apy: (Math.exp(bigIntToNumber(aprTvlData.globalData.irApr, 18)) - 1) * 100,
        reward_cut: bigIntToNumber(aprTvlData.globalData.rewardCut, 3),
      }
    })

    return { formattedData, marketsTotalDeposited, marketsTotalBorrowed }
  }

  private computeCurrentStreamedAPR(onchainData: TVLAprs, prices: Prices): NumMap {
    // Total stake in $ computed with price oracle
    const tvlTangent = Number(formatEther(onchainData.globalData.totalStakedUSD))

    const actualAPRs: { [aprKey: string]: number } = {} // APY: item?.latestWeeklyApy

    // Iterates over all rewards tokens streaming
    onchainData.currentAPR.forEach((streamData) => {
      const rewardAddress = streamData.token.toLowerCase()
      const priceInfo = prices[rewardAddress]
      if (priceInfo) {
        // Compute the USD distributed per year with the annual rate
        const usdPerYear = Number(formatUnits(streamData.amount, priceInfo.decimals)) * priceInfo.price
        // Get the display key of the APR
        const key = rewardTokens.find((rewardToken) => rewardToken.address.toLowerCase() === rewardAddress.toLowerCase())!.symbol
        // Divide the amount
        actualAPRs[key] = (usdPerYear * 100) / tvlTangent
      } else {
        console.error(`No priceInfo for ${rewardAddress}`)
      }
    })

    return actualAPRs
  }
}
