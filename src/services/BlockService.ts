import { JsonRpcProvider } from "ethers"
import { indexerConfig } from "../config/indexer_config"
import { BlockRepository } from "../db/BlockRepository"

export class BlockService {
  blockRepository: BlockRepository

  constructor(blockRepository: BlockRepository) {
    this.blockRepository = blockRepository
  }

  async updateLastBlockIndexed(blockId: number) {
    await this.blockRepository.storeBlockTracking(blockId)
  }

  async getLastBlockIndexed() {
    const blocks = await this.blockRepository.getLastBlockIndexed()
    return !blocks ? Number(process.env.LAST_BLOCK_INDEXED) : blocks.block_id
  }

  static async getIndexerBlockInfo(providers: JsonRpcProvider[], blockService: BlockService) {
    const { startingBlock, blockRange } = indexerConfig
    const startBlock = Number(await blockService.getLastBlockIndexed()) + 1 || startingBlock
    let endBlock: number
    const actualBlocks = await Promise.all(providers.map((provider) => provider.getBlockNumber()))
    const actualBlock = Math.max(...actualBlocks)
    const bestProvider = providers[actualBlocks.indexOf(actualBlock)]

    // no block to index
    if (startBlock === actualBlock + 1) {
      return false
    }

    if (startBlock + blockRange > actualBlock!) {
      // If the actual block is closed enough to the lastBlockIndexed we can use it
      endBlock = actualBlock
    } else {
      // Else we get a step toward it
      endBlock = startBlock + blockRange
    }
    return { startBlock, endBlock, actualBlock, bestProvider }
  }
}
