import { AbstractRepository } from "./AbstractRepository"

export class BlockRepository extends AbstractRepository {
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
