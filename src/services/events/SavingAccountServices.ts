import { Prisma } from "@prisma/client"

import { MarketGlobalDataRepository } from "../../db/MarketGlobalDataRepository.js"
import { SavingAccountRepository } from "../../db/SavingAccountRepository.js"
import { formatEther } from "ethers"
import { ProcessReportEvent } from "../../eventFectcher/savingAccountEventFetcher.js"

export class SavingAccountServices {
  savingAccountRepository: SavingAccountRepository

  constructor(savingAccountRepository: SavingAccountRepository) {
    this.savingAccountRepository = savingAccountRepository
  }

  formatSavingAccountEvents(events: ProcessReportEvent[], blockInfos: Map<number, number>): Prisma.process_reportCreateInput[] {
    return events.map((event) => {
      return {
        token: event.token.toString(),
        block_id: event.block_id,
        tx_hash: event.tx_hash,
        gain: event.gain?.toString(),
        currentDebtAfter: event.currentDebtAfter?.toString(),
        block_date: new Date(blockInfos.get(event.block_id)! * 1_000),
      } satisfies Prisma.process_reportCreateInput
    })
  }

  async saveSavingAccountEvents(events: ProcessReportEvent[], blockInfos: Map<number, number>): Promise<void> {
    const processReportEvents = this.formatSavingAccountEvents(events, blockInfos)
    await this.savingAccountRepository.saveEvents(processReportEvents)
  }

  async processSavingAccountApy(globalDataRepository: MarketGlobalDataRepository, sTanAddress: string, sUSGAddress: string): Promise<void> {
    if (!globalDataRepository) {
      throw new Error("SavingAccount: Missing globalDataRepository")
    }

    // we get the ID of our indicators from global_indicators
    const globalIndicatorData = [
      {
        key: "SAVING_APY_USG",
        args: sUSGAddress,
      },
      { key: "SAVING_APY_TAN", args: sTanAddress },
    ]

    let indicators = await globalDataRepository.getGlobalIndicatorIds(globalIndicatorData)
    const notInsertedIndicators = globalIndicatorData.filter((v) => !indicators.has(v.key)).map((v) => ({ key: v.key, args: v.args }))
    if (notInsertedIndicators.length > 0) {
      const newIndicators = await globalDataRepository.insertGlobalIndicator(notInsertedIndicators)
      indicators = new Map([...indicators, ...newIndicators])
    }
    const sTanId = indicators.get("SAVING_APY_TAN")
    const sUsgId = indicators.get("SAVING_APY_USG")
    // Check if all is ok
    if (!sTanId || !sUsgId) {
      throw new Error("SavingAccount: Missing indicator in  global_indicators")
    }
    // get the last APY date  or an old date if no data .

    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // find process_report events that occur after trhe last check date
    const processReportEvents = await this.savingAccountRepository.findEventsAfterDate(sevenDaysAgo)

    // Only consider configured tokens (case-insensitive)
    const targetAddresses = [sTanAddress.toLowerCase(), sUSGAddress.toLowerCase()]

    const apys = new Map<string, number>()
    for (const target of targetAddresses) {
      const tokenEvents = processReportEvents.filter((ev) => ev.token.toLowerCase() === target)
      if (tokenEvents.length === 0) {
        continue
      }
      const amountForSevenDays = tokenEvents.reduce<bigint>((agg, ev) => agg + BigInt(ev.gain), 0n)
      if (amountForSevenDays === 0n) {
        continue
      }
      apys.set(target, Number(formatEther(amountForSevenDays)) / 52)
    }
    if (apys.size === 0) {
      return
    }
    // insert the DATA
    const date = new Date()
    const addressToIndicatorId = new Map<string, bigint>([
      [sTanAddress.toLowerCase(), sTanId as bigint],
      [sUSGAddress.toLowerCase(), sUsgId as bigint],
    ])

    const insertData = Array.from(apys.entries())
      .map(([token, apy]) => {
        const indicatorId = addressToIndicatorId.get(token.toLowerCase())
        if (!indicatorId) {
          return null
        }
        return {
          global_indicator_id: indicatorId,
          timestamp: date,
          value: apy,
        }
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)

    await globalDataRepository.insertGlobalIndicatorValue(insertData)
  }
}
