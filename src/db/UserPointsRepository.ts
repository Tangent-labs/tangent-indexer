import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository"

export class UserPointsRepository extends AbstractRepository {
  async insertTransfers(events: Prisma.transfert_eventsCreateInput[]) {
    if (events.length > 0) {
      await this.prismaClient.transfert_events.createMany({
        data: events,
      })
    }
  }

  async insertAddresses(events: Prisma.user_addressesCreateInput[]) {
    if (events.length > 0) {
      const uniqueAddresses = Array.from(new Map(events.map((event) => [event.address, event])).values())
      await this.prismaClient.user_addresses.createMany({
        data: uniqueAddresses,
        skipDuplicates: true,
      })
    }
  }
}
