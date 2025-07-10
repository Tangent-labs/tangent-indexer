import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository"

export class UserPointsRepository extends AbstractRepository {
  async insertTransfers(events: Prisma.points_actionCreateInput[]) {
    if (events.length > 0) {
      await this.prismaClient.points_action.createMany({
        data: events,
      })
    }
  }
}
