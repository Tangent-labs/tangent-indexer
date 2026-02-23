import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository.js"

export class PositionSnapshotRepository extends AbstractRepository {
  async saveSnapshots(snapshots: Prisma.position_snapshotsCreateManyInput[]) {
    if (!snapshots.length) return
    await this.prismaClient.position_snapshots.createMany({
      data: snapshots,
    })
  }

  /**
   * Returns the latest snapshot per (market_id, borrower_address) pair
   * from the last 24 hours.
   */
  async getLatestSnapshotsWithin24h() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

    return this.prismaClient.$queryRaw<{ market_id: bigint; borrower_address: string; user_debt: number; position_value_usd: number }[]>`
      SELECT DISTINCT ON (market_id, borrower_address)
        market_id, borrower_address, user_debt, position_value_usd
      FROM global.position_snapshots
      WHERE snapshot_timestamp >= ${since}
      ORDER BY market_id, borrower_address, snapshot_timestamp DESC
    `
  }
}
