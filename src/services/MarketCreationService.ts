import { AddressLike, JsonRpcProvider } from "ethers"

import { indexerConfig } from "../config/indexer_config"
import { MarketContractsRepository } from "../db/MarketContractsRepository"
import { fetchMarketCreationLogs } from "../eventFectcher/marketCreationEventFectcher"

import { EventDetectionService } from "../type/service"

export class MarketCreationService implements EventDetectionService {
  marketContractsRepository: MarketContractsRepository

  constructor(marketContractsRepository: MarketContractsRepository) {
    this.marketContractsRepository = marketContractsRepository
  }

  async runDetection(provider: JsonRpcProvider, startingBlock: number, endingBlock: number) {
    // get the constant from the config
    const marketCreatorAddress: AddressLike = indexerConfig.constracts.marketCreatorAddress

    // fetch the logs
    const logs = await fetchMarketCreationLogs(provider, startingBlock, endingBlock, marketCreatorAddress)
    if (!logs.length) return

    // Insert the new contracts
    await this.marketContractsRepository.insertNonExistingContractsFromLogs(logs)
  }
}
