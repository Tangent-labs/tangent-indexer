import { JsonRpcProvider } from "ethers"
import { indexerConfig } from "../config/indexer_config.js"
import { BlockRepository } from "../db/BlockRepository.js"

export type BlockInfo = { result: { number: string; timestamp: string } }

export class BlockService {
  blockRepository: BlockRepository

  constructor(blockRepository: BlockRepository) {
    this.blockRepository = blockRepository
  }

  // VOTES POINTS

  async getLastEpochDateAndBestProvider(providers: JsonRpcProvider[]) {
    const lastVoteBlockInfo = await this.blockRepository.getLastVotesPointsBlock()

    const actualBlocks = await Promise.all(providers.map((provider) => provider.getBlockNumber()))
    const actualBlock = Math.max(...actualBlocks)

    const bestProviderIndex = actualBlocks.indexOf(actualBlock)
    const bestProvider = providers[bestProviderIndex]

    return { lastEpochDate: lastVoteBlockInfo?.epoch_date, bestProvider, bestProviderIndex }
  }

  // LP POINTS
  async getLastLPBlockIndexed() {
    const blocks = await this.blockRepository.getLastLPPointsBlock()
    return !blocks ? Number(process.env.STARTING_BLOCK) : blocks.block_id
  }

  async getLPPointsBlockInfo(providers: JsonRpcProvider[]) {
    const { startingBlock } = indexerConfig
    const startBlock = Number(await this.getLastLPBlockIndexed()) || startingBlock
    const endBlock = Number(await this.getLastEventBlockIndexed())

    const actualBlocks = await Promise.all(providers.map((provider) => provider.getBlockNumber()))
    const actualBlock = Math.max(...actualBlocks)

    const bestProviderIndex = actualBlocks.indexOf(actualBlock)
    const bestProvider = providers[bestProviderIndex]

    if (startBlock === endBlock) {
      return false
    }

    return { startBlock, endBlock, bestProvider, bestProviderIndex }
  }

  // EVENTS
  async getLastEventBlockIndexed() {
    const blocks = await this.blockRepository.getLastEventBlock()
    return !blocks ? Number(process.env.STARTING_BLOCK) : blocks.block_id
  }

  async getIndexerBlockInfo(providers: JsonRpcProvider[]) {
    const { startingBlock, blockRange } = indexerConfig
    const startBlock = Number(await this.getLastEventBlockIndexed()) + 1 || startingBlock
    let endBlock: number
    const actualBlocks = await Promise.all(providers.map((provider) => provider.getBlockNumber()))
    const actualBlock = Math.max(...actualBlocks)
    const bestProviderIndex = actualBlocks.indexOf(actualBlock)
    const bestProvider = providers[bestProviderIndex]

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
    return { startBlock, endBlock, actualBlock, bestProvider, bestProviderIndex }
  }
}
