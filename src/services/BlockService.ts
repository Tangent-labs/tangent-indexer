import { JsonRpcProvider } from "ethers"
import axios from "axios"
import { indexerConfig } from "../config/indexer_config.js"
import { BlockRepository } from "../db/BlockRepository.js"

export type BlockInfo = { result: { number: string; timestamp: string } }

export class BlockService {
  blockRepository: BlockRepository

  constructor(blockRepository: BlockRepository) {
    this.blockRepository = blockRepository
  }

  // VOTES POINTS

  async getLastVoteBlockIndexed() {
    const blocks = await this.blockRepository.getLastVotesPointsBlock()
    return !blocks ? Number(process.env.STARTING_BLOCK) : blocks.block_id
  }

  async getVotesBlockInfo(providers: JsonRpcProvider[]) {
    const { startingBlock, blockRange } = indexerConfig
    const startBlock = Number(await this.getLastVoteBlockIndexed()) + 1 || startingBlock
    let endBlock = Number(await this.getLastEventBlockIndexed())

    const actualBlocks = await Promise.all(providers.map((provider) => provider.getBlockNumber()))
    const actualBlock = Math.max(...actualBlocks)

    const bestProviderIndex = actualBlocks.indexOf(actualBlock)
    const bestProvider = providers[bestProviderIndex]

    // no block to index
    if (startBlock === endBlock + 1) {
      return false
    }

    if (startBlock + blockRange < actualBlock!) {
      // Else we get a step toward it
      endBlock = startBlock + blockRange
    }
    return { startBlock, endBlock, bestProvider, bestProviderIndex }
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

  async fetchBlockTimestamps(blockNumbers: (number | string)[], providerURL: string) {
    const requests = blockNumbers.map((blockNumber, index) => {
      // This kind of black magic is mandatory because of Log from ethers returns sometimes a string
      if (typeof blockNumber === "number") {
        blockNumber = "0x" + blockNumber.toString(16)
      }
      return {
        jsonrpc: "2.0",
        id: index + 1,
        method: "eth_getBlockByNumber",
        params: [
          blockNumber, // format hex
          false,
        ],
      }
    })

    const res = await axios.post(providerURL, requests, {
      headers: { "Content-Type": "application/json" },
    })

    const responses = res.data as BlockInfo[]

    const timestampPerBlockId: Map<number, number> = new Map()

    responses.forEach((resp: BlockInfo) => {
      timestampPerBlockId.set(parseInt(resp.result.number, 16), parseInt(resp.result.timestamp, 16))
    })

    return timestampPerBlockId
  }
}
