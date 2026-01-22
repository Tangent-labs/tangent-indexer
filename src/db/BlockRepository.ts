import { AbstractRepository } from "./AbstractRepository.js"

export class BlockRepository extends AbstractRepository {
  // VOTES POINTS
  async getLastVotesPointsBlock() {
    const lastBlock = await this.prismaClient.votes_points_blocks.findFirst({
      orderBy: {
        block_id: "desc",
      },
    })

    return lastBlock
  }

  async storeVotesPointsBlock(block_date: Date, new_epoch_date: Date) {
    await this.prismaClient.votes_points_blocks.create({
      data: {
        block_date,
        epoch_date: new_epoch_date,
      },
    })
  }

  // VOTES LP
  async getLastLPPointsBlock() {
    const lastBlock = await this.prismaClient.lp_points_block.findFirst({
      orderBy: {
        block_id: "desc",
      },
    })

    return lastBlock
  }

  async storeLPPointsBlock(blockId: number) {
    await this.prismaClient.lp_points_block.create({
      data: {
        block_id: blockId,
      },
    })
  }

  // EVENTS
  async getLastEventBlock() {
    const lastBlock = await this.prismaClient.event_blocks.findFirst({
      orderBy: {
        block_id: "desc",
      },
    })

    return lastBlock
  }

  async storeEventBlock(blockId: number, date: Date) {
    await this.prismaClient.event_blocks.create({
      data: {
        block_id: blockId,
        created_at: date,
      },
    })
  }

  /**
   * Create multiple global block tracking entries in a single transaction
   */
  async createMultiBlockTracking(blockIds: number[]) {
    if (blockIds.length > 0) {
      const now = new Date()
      return await this.prismaClient.lp_points_block.createMany({
        data: blockIds.map((blockId) => ({
          block_id: blockId,
          created_at: now,
        })),
        skipDuplicates: true,
      })
    }
  }
}
