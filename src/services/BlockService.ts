import { JsonRpcProvider } from "ethers"
import { indexerConfig } from "../config/indexer_config"
import { BlockRepository } from "../db/BlockRepository"

export type BlockInfo = { result: { number: string; timestamp: string } }

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

  async fetchBlockTimestamps(blockNumbers: number[], providerURL: string) {
    const requests = blockNumbers.map((blockNumber, index) => ({
      jsonrpc: "2.0",
      id: index + 1,
      method: "eth_getBlockByNumber",
      params: [
        "0x" + blockNumber.toString(16), // format hex
        false,
      ],
    }))

    const res = await fetch(providerURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requests),
    })

    const responses = (await res.json()) as BlockInfo[]

    const timestampPerBlockId: Map<number, number> = new Map()

    responses.forEach((resp: BlockInfo) => {
      timestampPerBlockId.set(parseInt(resp.result.number, 16), parseInt(resp.result.timestamp, 16))
    })

    return timestampPerBlockId
  }

  static async getIndexerBlockInfo(providers: JsonRpcProvider[], blockService: BlockService) {
    const { startingBlock, blockRange } = indexerConfig
    const startBlock = Number(await blockService.getLastBlockIndexed()) + 1 || startingBlock
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
