import { AbstractRepository } from "./AbstractRepository.js"
import { Prisma } from "@prisma/client"

export class SavingAccountRepository extends AbstractRepository {
  async saveEvents(events: Prisma.process_reportCreateInput[]) {
    await this.prismaClient.process_report.createMany({
      data: events,
    })
  }
}
