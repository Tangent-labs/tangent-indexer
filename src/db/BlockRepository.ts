import { AbstractRepository } from "./AbstractRepository"

export class BlockRepository extends AbstractRepository {
  // GET
  async getLastVoteBlockIndexed() {
    const lastBlock = await this.prismaClient.last_vote_processed_block.findFirst({
      orderBy: {
        block_id: "desc",
      },
    })

    return lastBlock
  }

  // STORE

  async storeVoteBlockTracking(blockId: number) {
    await this.prismaClient.last_vote_processed_block.create({
      data: {
        block_id: blockId,
      },
    })
  }

  // GET
  async getLastEventBlockIndexed() {
    const lastBlock = await this.prismaClient.last_processed_block.findFirst({
      orderBy: {
        block_id: "desc",
      },
    })

    return lastBlock
  }

  // STORE

  async storeEventBlockTracking(blockId: number) {
    const existing = await this.prismaClient.last_processed_block.findUnique({
      where: { block_id: blockId },
    })
    if (!existing) {
      await this.prismaClient.last_processed_block.create({
        data: {
          block_id: blockId,
        },
      })
    }
  }

  // GET
  async getLastBlockIndexed() {
    const lastBlock = await this.prismaClient.global_blocks.findFirst({
      orderBy: {
        block_id: "desc",
      },
    })

    return lastBlock
  }

  // STORE
  async storeBlockTracking(blockId: number) {
    await this.prismaClient.global_blocks.create({
      data: {
        block_id: blockId,
        created_at: new Date(),
      },
    })
  }
}
