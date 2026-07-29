import { Log, formatEther, id } from "ethers"

import { TRANSFER_TOPICS } from "../../eventFectcher/erc20TransferEventFetcher.js"
import { RevenuesRepository } from "../../db/RevenuesRepository.js"
import { defiLLamaFetchPricesHistorical, getPriceInfos } from "../globalData/DefiLLamaPriceFetcher.js"
import { Prisma } from "@prisma/client"
import { parseCheckpointIR, parseRewardNotified } from "../../eventFectcher/revenuesEvents.parser.js"
import { CHECKPOINT_IR } from "../../resources/eventSignatures.js"

const DAY_MS = 24 * 60 * 60 * 1000

function startOfUTCDay(date: Date) {
  const d = new Date(date.getTime())
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function dayKey(date: Date) {
  return startOfUTCDay(date).getTime()
}

export class RevenuesService {
  revenuesRepository: RevenuesRepository

  constructor(revenuesRepository: RevenuesRepository) {
    this.revenuesRepository = revenuesRepository
  }

  async parseRevenuesEvents(
    marketLogs: Log[],
    transferLogs: Log[],
    mapMarketIdAddresses: Map<string, number>
  ): Promise<{ checkpointIR: Prisma.checkpoint_irCreateManyInput[]; rewardCut: Prisma.reward_notifiedCreateManyInput[]; revenuesBlockIds: Set<number> }> {
    const allRewards = await this.revenuesRepository.getRevenuesTokens()
    const mapTokenIdAddresses: Map<string, bigint> = new Map()

    allRewards.forEach((r) => {
      mapTokenIdAddresses.set(r.address.toLowerCase(), r.id)
    })

    const uniqueBlockId: Set<number> = new Set()
    const checkpointIREvents: Prisma.checkpoint_irCreateManyInput[] = []
    const rewardNotifiedEvents: Prisma.reward_notifiedCreateManyInput[] = []

    marketLogs.forEach((log) => {
      const logTopic = log.topics[0]
      uniqueBlockId.add(log.blockNumber)
      if (id(CHECKPOINT_IR) === logTopic) {
        const irEvent = parseCheckpointIR(log, mapMarketIdAddresses)
        checkpointIREvents.push(irEvent)
      }
    })

    transferLogs.forEach((log) => {
      const logTopic = log.topics[0]
      uniqueBlockId.add(log.blockNumber)
      if (TRANSFER_TOPICS.RewardNotified === logTopic) {
        const rewardNotifiedEvent = parseRewardNotified(log, mapMarketIdAddresses, mapTokenIdAddresses)
        rewardNotifiedEvents.push(rewardNotifiedEvent)
      }
    })
    return { checkpointIR: checkpointIREvents, rewardCut: rewardNotifiedEvents, revenuesBlockIds: uniqueBlockId }
  }

  async saveEvents(checkpointIR: Prisma.checkpoint_irCreateManyInput[], rewardDistributed: Prisma.reward_notifiedCreateManyInput[]) {
    await this.revenuesRepository.saveCheckpointIRs(checkpointIR)
    await this.revenuesRepository.saveRewardDistributed(rewardDistributed)
  }

  async computeRevenuesForRange(from: Date, today: Date) {
    const tokenPrices = await this.revenuesRepository.getRewardTokenPrices(from, today)

    const tokenPricesPerDate = new Map<number, Prisma.revenues_token_pricesCreateManyInput[]>()

    tokenPrices.forEach((t) => {
      const key = dayKey(t.day)
      const data = tokenPricesPerDate.get(key)
      if (data) {
        data.push(t)
        tokenPricesPerDate.set(key, data)
      } else {
        tokenPricesPerDate.set(key, [t])
      }
    })

    // If D-1 price is not here for some tokens, call defillama defiLLamaFetchPricesHistorical to get the yesterday price
    const yesterday = startOfUTCDay(new Date(today.getTime() - DAY_MS))
    const yesterdayKey = dayKey(yesterday)

    const allTokens = await this.revenuesRepository.getRevenuesTokens()
    const tokensWithYesterdayPrice = new Set((tokenPricesPerDate.get(yesterdayKey) ?? []).map((p) => p.token_id.toString()))
    const missingTokens = allTokens.filter((t) => !tokensWithYesterdayPrice.has(t.id.toString()))

    // If some prices are missing for yesterday, let's fetch and store them
    if (missingTokens.length > 0) {
      const noon = new Date(yesterday.getTime())
      noon.setUTCHours(12, 0, 0, 0)
      const fetchedPrices = await defiLLamaFetchPricesHistorical(
        Math.floor(noon.getTime() / 1000),
        missingTokens.map((t) => t.address),
        12
      )

      const newPriceRows: Prisma.revenues_token_pricesCreateManyInput[] = []
      missingTokens.forEach((token) => {
        const priceInfo = getPriceInfos(fetchedPrices, token.address)
        if (priceInfo) {
          newPriceRows.push({
            day: yesterday,
            price: priceInfo.price,
            token_id: token.id,
          })
        }
      })

      // Store D-1 price
      if (newPriceRows.length > 0) {
        await this.revenuesRepository.saveRewardTokenPrices(newPriceRows)
        tokenPricesPerDate.set(yesterdayKey, [...(tokenPricesPerDate.get(yesterdayKey) ?? []), ...newPriceRows])
      }
    }

    // Retrieve revenues events getUSGMintedInterests and getRewardCuts
    const [usgMintedInterests, rewardCuts] = await Promise.all([
      this.revenuesRepository.getUSGMintedInterests(from, today),
      this.revenuesRepository.getRewardCuts(from, today),
    ])

    // Retrieve revenues of each day between from and today
    const alreadyComputedDays = await this.revenuesRepository.getDailyRevenues(from, today)
    const computedDaysKeys = new Set(alreadyComputedDays.map((d) => dayKey(d.day)))

    const todayKey = dayKey(today)
    const days: Date[] = []
    for (let t = startOfUTCDay(from).getTime(); t <= todayKey; t += DAY_MS) {
      days.push(new Date(t))
    }

    // Computes revenues based on event and tokenPrices on D0 and days without revenues computed
    const dailyRevenuesToStore: Prisma.daily_revenuesCreateManyInput[] = []
    const dailyRevenuesMarketToStore: Prisma.daily_revenues_marketCreateManyInput[] = []

    for (const day of days) {
      const key = dayKey(day)
      const isToday = key === todayKey

      // Skip days that are already closed out, D0 is always recomputed until it closes
      if (computedDaysKeys.has(key) && !isToday) {
        continue
      }

      const dayInterests = usgMintedInterests.filter((i) => dayKey(i.block_date) === key)
      const dayRewardCuts = rewardCuts.filter((r) => dayKey(r.block_date) === key)

      // For D0, take the price of D-1 since D0 price isn't settled yet
      const pricesForDay = isToday ? tokenPricesPerDate.get(yesterdayKey) : tokenPricesPerDate.get(key)
      const priceByTokenId = new Map((pricesForDay ?? []).map((p) => [p.token_id.toString(), p.price]))

      const irRevenueByMarket = new Map<string, number>()
      dayInterests.forEach((i) => {
        // Considers USG as 1$
        const marketKey = i.market_id.toString()
        const value = Number(formatEther(i.interest))
        irRevenueByMarket.set(marketKey, (irRevenueByMarket.get(marketKey) ?? 0) + value)
      })

      const rewardsRevenueByMarket = new Map<string, number>()
      dayRewardCuts.forEach((r) => {
        const price = priceByTokenId.get(r.token_id.toString())
        if (price === undefined) return
        const marketKey = r.market_id.toString()
        const value = Number(formatEther(r.reward_cut)) * price
        rewardsRevenueByMarket.set(marketKey, (rewardsRevenueByMarket.get(marketKey) ?? 0) + value)
      })

      const marketIds = new Set([...irRevenueByMarket.keys(), ...rewardsRevenueByMarket.keys()])

      let dayIrRevenue = 0
      let dayRewardsRevenue = 0

      marketIds.forEach((marketIdKey) => {
        const irRevenue = irRevenueByMarket.get(marketIdKey) ?? 0
        const rewardsRevenue = rewardsRevenueByMarket.get(marketIdKey) ?? 0
        dayIrRevenue += irRevenue
        dayRewardsRevenue += rewardsRevenue

        dailyRevenuesMarketToStore.push({
          day,
          market_id: BigInt(marketIdKey),
          ir_revenue: irRevenue,
          rewards_revenue: rewardsRevenue,
        })
      })

      dailyRevenuesToStore.push({
        day,
        ir_revenue: dayIrRevenue,
        rewards_revenue: dayRewardsRevenue,
      })
    }

    // Store the revenues
    if (dailyRevenuesToStore.length > 0) {
      await this.revenuesRepository.saveDailyRevenues(dailyRevenuesToStore)
    }
    if (dailyRevenuesMarketToStore.length > 0) {
      await this.revenuesRepository.saveDailyRevenuesMarket(dailyRevenuesMarketToStore)
    }
  }
}
