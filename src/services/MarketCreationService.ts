import { AddressLike, JsonRpcProvider } from "ethers"
import { MarketContractsRepository } from "../db/MarketContractsRepository"
import { fetchMarketCreationLogs } from "../eventFectcher/marketCreationEventFectcher"
import { EventDetectionService } from "../type/service"

export class MarketCreationService implements EventDetectionService {
  marketContractsRepository: MarketContractsRepository
  marketCreatorAddress: AddressLike

  constructor(marketContractsRepository: MarketContractsRepository, marketCreatorAddress: AddressLike) {
    this.marketContractsRepository = marketContractsRepository
    this.marketCreatorAddress = marketCreatorAddress
  }

  async runDetection(provider: JsonRpcProvider, startingBlock: number, endingBlock: number) {
    // Fetch logs from MarketCreator
    const marketsCreated = await fetchMarketCreationLogs(provider, startingBlock, endingBlock, this.marketCreatorAddress)

    // If some logs are coming from MarketCreator, we insert them in db
    if (marketsCreated.length) {
      await this.marketContractsRepository.insertContracts(marketsCreated)
    }
  }
}
