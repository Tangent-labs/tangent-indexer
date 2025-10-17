import { Prisma } from "@prisma/client"
import { SavingAccountRepository } from "db/SavingAccountRepository.js"
import { ProcessReportEvent } from "eventFectcher/savingAccountEventFetcher.js"

export class SavingAccountServices {
  savingAccountRepository: SavingAccountRepository
  constructor(savingAccountRepository: SavingAccountRepository) {
    this.savingAccountRepository = savingAccountRepository
  }

  processSavingAccountEvents(events: ProcessReportEvent[], blockInfos: Map<number, number>): Prisma.process_reportCreateInput[] {
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
    const processReportEvents = this.processSavingAccountEvents(events, blockInfos)
    await this.savingAccountRepository.saveEvents(processReportEvents)
  }
}
