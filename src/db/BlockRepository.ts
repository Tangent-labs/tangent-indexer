import { AbstractRepository } from "./AbstractRepository"
import { GlobalBlock } from "type/prisma"

export class BlockRepository extends AbstractRepository {
  // GET
  async getLastEventBlockIndexed(): Promise<GlobalBlock> {
    const lastBlock = await this.prismaClient.last_processed_block.findFirst({
      orderBy: {
        block_id: "desc",
      },
    })

    return lastBlock as GlobalBlock
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
    } else {
      console.warn(`Block ${blockId} already exists in last_processed_block, skipping creation`)
    }
  }

  // GET
  async getLastBlockIndexed(): Promise<GlobalBlock> {
    const lastBlock = await this.prismaClient.global_blocks.findFirst({
      orderBy: {
        block_id: "desc",
      },
    })

    return lastBlock as GlobalBlock
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
