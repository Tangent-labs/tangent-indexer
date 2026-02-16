import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository.js"

export class PositionSnapshotRepository extends AbstractRepository {
  async saveSnapshots(snapshots: Prisma.position_snapshotsCreateManyInput[]) {
    if (!snapshots.length) return
    await this.prismaClient.position_snapshots.createMany({
      data: snapshots,
    })
  }
}
