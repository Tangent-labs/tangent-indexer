import { Prisma } from "@prisma/client"

import { VolumeRepository } from "../../db/VolumeRepository.js"
import { DAY_MS, dayKey, endOfUTCDay, startOfUTCDay } from "../../utils/date.js"
import { getAddressesJson } from "../../utils/jsonReader.js"

/**
 * @notice  Resolves a daily USD price with a fallback on the most recent earlier day of the range,
 *          for series that are not guaranteed to have a point every day
 */
function buildDailyPriceResolver(prices: { day: Date; avg_price: number }[]) {
  const priceByDay = new Map<number, number>()
  prices.forEach((p) => priceByDay.set(dayKey(p.day), p.avg_price))
  const days = [...priceByDay.keys()].sort((a, b) => a - b)

  return (key: number): number | undefined => {
    const exactPrice = priceByDay.get(key)
    if (exactPrice !== undefined) {
      return exactPrice
    }

    let fallbackPrice: number | undefined
    for (const day of days) {
      if (day > key) break
      fallbackPrice = priceByDay.get(day)
    }
    return fallbackPrice
  }
}

export class VolumeService {
  volumeRepository: VolumeRepository

  constructor(volumeRepository: VolumeRepository) {
    this.volumeRepository = volumeRepository
  }

  /**
   * @notice  Computes the daily protocol volume between `from` and `to`, both included, over its
   *          four parts: market collateral, market debt, USG pools and sUSG.
   *          Days already stored are skipped, except the last one of the range which is
   *          recomputed on every run until it is closed.
   */
  async computeVolumesForRange(from: Date, to: Date) {
    const rangeStart = startOfUTCDay(from)
    const rangeEnd = endOfUTCDay(to)

    const {
      tokens: { USG, sUSG },
    } = await getAddressesJson()
    const usgAddress = USG.toLowerCase()
    const susgAddress = sUSG.toLowerCase()

    // The flows come pre-aggregated per day, collateral and LP amounts still unpriced
    const [flows, prices, lpFlows, lpKeys, susgFlows, susgPrices] = await Promise.all([
      this.volumeRepository.getDailyMarketFlows(rangeStart, rangeEnd),
      this.volumeRepository.getDailyCollateralPrices(rangeStart, rangeEnd),
      this.volumeRepository.getDailyLpFlows(rangeStart, rangeEnd),
      this.volumeRepository.getUsgLpKeys(),
      this.volumeRepository.getDailySusgFlows(sUSG, rangeStart, rangeEnd),
      this.volumeRepository.getDailyTokenPrices(sUSG, rangeStart, rangeEnd),
    ])

    const flowsPerDay = new Map<number, typeof flows>()
    flows.forEach((flow) => {
      const key = dayKey(flow.day)
      const dayFlows = flowsPerDay.get(key)
      if (dayFlows) {
        dayFlows.push(flow)
      } else {
        flowsPerDay.set(key, [flow])
      }
    })

    const lpFlowsPerDay = new Map<number, typeof lpFlows>()
    lpFlows.forEach((flow) => {
      const key = dayKey(flow.day)
      const dayFlows = lpFlowsPerDay.get(key)
      if (dayFlows) {
        dayFlows.push(flow)
      } else {
        lpFlowsPerDay.set(key, [flow])
      }
    })

    const susgFlowPerDay = new Map(susgFlows.map((f) => [dayKey(f.day), f]))
    const lpKeyById = new Map(lpKeys.map((lp) => [lp.id.toString(), lp]))

    // Index the daily average oracle prices, keeping the day list per market for the fallback
    const priceByMarketAndDay = new Map<string, number>()
    const priceDaysByMarket = new Map<string, number[]>()
    prices.forEach((p) => {
      const marketKey = p.market_id.toString()
      const key = dayKey(p.day)
      priceByMarketAndDay.set(`${marketKey}-${key}`, p.avg_price)
      const days = priceDaysByMarket.get(marketKey)
      if (days) {
        days.push(key)
      } else {
        priceDaysByMarket.set(marketKey, [key])
      }
    })
    priceDaysByMarket.forEach((days) => days.sort((a, b) => a - b))

    // Falls back to the most recent earlier day of the range when a market has no price that day
    const priceFor = (marketKey: string, key: number): number | undefined => {
      const exactPrice = priceByMarketAndDay.get(`${marketKey}-${key}`)
      if (exactPrice !== undefined) {
        return exactPrice
      }

      let fallbackPrice: number | undefined
      for (const day of priceDaysByMarket.get(marketKey) ?? []) {
        if (day > key) break
        fallbackPrice = priceByMarketAndDay.get(`${marketKey}-${day}`)
      }
      return fallbackPrice
    }

    const susgPriceFor = buildDailyPriceResolver(susgPrices)

    // Days already closed out are kept as is, the last day of the range is always recomputed
    const alreadyComputedDays = await this.volumeRepository.getDailyVolumes(rangeStart, rangeEnd)
    const computedDaysKeys = new Set(alreadyComputedDays.map((d) => dayKey(d.day)))
    const lastDayKey = dayKey(rangeEnd)

    const dailyVolumesToStore: Prisma.daily_volumesCreateManyInput[] = []
    const dailyVolumesMarketToStore: Prisma.daily_volumes_marketCreateManyInput[] = []
    const dailyVolumesLpToStore: Prisma.daily_volumes_lpCreateManyInput[] = []

    for (let key = dayKey(rangeStart); key <= lastDayKey; key += DAY_MS) {
      const isLastDay = key === lastDayKey
      if (computedDaysKeys.has(key) && !isLastDay) {
        continue
      }

      const day = new Date(key)

      let dayCollateralIn = 0
      let dayCollateralOut = 0
      let dayDebtIn = 0
      let dayDebtOut = 0

      for (const flow of flowsPerDay.get(key) ?? []) {
        const marketKey = flow.market_id.toString()
        const price = priceFor(marketKey, key)
        if (price === undefined && (flow.collateral_in > 0 || flow.collateral_out > 0)) {
          console.warn(`No oracle price for market ${marketKey} on ${day.toISOString()}, its collateral volume is skipped for that day`)
        }

        // Collateral is priced with the oracle, debt is USG hence valued at $1
        const collateralIn = flow.collateral_in * (price ?? 0)
        const collateralOut = flow.collateral_out * (price ?? 0)

        dayCollateralIn += collateralIn
        dayCollateralOut += collateralOut
        dayDebtIn += flow.debt_in
        dayDebtOut += flow.debt_out

        dailyVolumesMarketToStore.push({
          day,
          market_id: flow.market_id,
          collateral_in: collateralIn,
          collateral_out: collateralOut,
          debt_in: flow.debt_in,
          debt_out: flow.debt_out,
        })
      }

      let dayLpLiquidityIn = 0
      let dayLpLiquidityOut = 0
      let dayLpSwap = 0

      // sUSG is an ERC4626 wrapper of USG: it accrues yield, so it is worth more than $1 and is
      // priced from its feed, both as a pool coin and for its own mints and burns
      const susgPrice = susgPriceFor(key)
      const coinPrice = (coin: string): number | undefined => {
        if (coin === usgAddress) return 1
        if (coin === susgAddress) return susgPrice
        // The coin paired with USG or sUSG in these pools is a USD stable
        return 1
      }

      for (const lpFlow of lpFlowsPerDay.get(key) ?? []) {
        const lpKey = lpKeyById.get(lpFlow.usg_lp_id.toString())
        // Coins and decimals are nullable, a pool seeded before they were recorded cannot be valued
        if (!lpKey?.token_0 || !lpKey?.token_1 || lpKey.token_0_decimals === null || lpKey.token_1_decimals === null) {
          console.warn(`No coin order or decimals for USG LP ${lpFlow.usg_lp_id}, its volume is skipped for ${day.toISOString()} (run backfill_usg_lp_coins)`)
          continue
        }

        // Pricing the paired coin at $1 only holds for a USG or sUSG pool. Anything else would be
        // wrong on every leg, so it is left out rather than guessed.
        const anchors = [usgAddress, susgAddress]
        const anchorIndex = anchors.includes(lpKey.token_0) ? 0 : anchors.includes(lpKey.token_1) ? 1 : undefined
        if (anchorIndex === undefined) {
          console.warn(`USG LP ${lpFlow.usg_lp_id} (${lpKey.lp_name}) holds neither USG nor sUSG, its volume is skipped for ${day.toISOString()}`)
          continue
        }

        const token0Price = coinPrice(lpKey.token_0)
        const token1Price = coinPrice(lpKey.token_1)
        if (token0Price === undefined || token1Price === undefined) {
          console.warn(`No sUSG price on ${day.toISOString()}, the volume of ${lpKey.lp_name} is skipped for that day`)
          continue
        }

        // Decimals differ from one coin to the other
        const token0Unit = 10 ** lpKey.token_0_decimals
        const token1Unit = 10 ** lpKey.token_1_decimals

        const liquidityIn = (lpFlow.liquidity_in_token0 / token0Unit) * token0Price + (lpFlow.liquidity_in_token1 / token1Unit) * token1Price
        const liquidityOut = (lpFlow.liquidity_out_token0 / token0Unit) * token0Price + (lpFlow.liquidity_out_token1 / token1Unit) * token1Price

        // A swap always has USG or sUSG on exactly one leg, counting that leg prices the notional once
        const swap = anchorIndex === 0 ? (lpFlow.swap_token0 / token0Unit) * token0Price : (lpFlow.swap_token1 / token1Unit) * token1Price

        dayLpLiquidityIn += liquidityIn
        dayLpLiquidityOut += liquidityOut
        dayLpSwap += swap

        dailyVolumesLpToStore.push({
          day,
          usg_lp_id: lpFlow.usg_lp_id,
          liquidity_in: liquidityIn,
          liquidity_out: liquidityOut,
          swap,
        })
      }

      // sUSG mints and burns, valued with the average sUSG price of the day
      const susgFlow = susgFlowPerDay.get(key)
      if (susgFlow && susgPrice === undefined && (susgFlow.minted > 0 || susgFlow.burned > 0)) {
        console.warn(`No sUSG price on ${day.toISOString()}, its volume is skipped for that day`)
      }
      const susgIn = (susgFlow?.minted ?? 0) * (susgPrice ?? 0)
      const susgOut = (susgFlow?.burned ?? 0) * (susgPrice ?? 0)

      dailyVolumesToStore.push({
        day,
        collateral_in: dayCollateralIn,
        collateral_out: dayCollateralOut,
        debt_in: dayDebtIn,
        debt_out: dayDebtOut,
        lp_liquidity_in: dayLpLiquidityIn,
        lp_liquidity_out: dayLpLiquidityOut,
        lp_swap: dayLpSwap,
        susg_in: susgIn,
        susg_out: susgOut,
      })
    }

    if (dailyVolumesToStore.length > 0) {
      await this.volumeRepository.saveDailyVolumes(dailyVolumesToStore)
    }
    if (dailyVolumesMarketToStore.length > 0) {
      await this.volumeRepository.saveDailyVolumesMarket(dailyVolumesMarketToStore)
    }
    if (dailyVolumesLpToStore.length > 0) {
      await this.volumeRepository.saveDailyVolumesLp(dailyVolumesLpToStore)
    }
  }
}
