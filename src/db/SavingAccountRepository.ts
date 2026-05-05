import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository.js"

export type processReportDbEvent = Prisma.process_reportGetPayload<{}>

export class SavingAccountRepository extends AbstractRepository {
  async findEventsAfterDate(startDate: Date): Promise<processReportDbEvent[]> {
    return await this.prismaClient.process_report.findMany({
      where: {
        block_date: {
          gt: startDate,
        },
      },
    })
  }

  async saveEvents(events: Prisma.process_reportCreateInput[]) {
    await this.prismaClient.process_report.createMany({
      data: events,
    })
  }
}
