import { JsonRpcProvider, AddressLike } from "ethers"
import { MarketContractsRepository } from "../db/MarketContractsRepository"
import { EventDetectionService } from "../type/service"
import { MarketLeverageRepository } from "db/MarketLeverageRepository"
import { fetchMarketLeverageLogs } from "eventFectcher/marketLeverageEventFetcher"

export class MarketLeverageService implements EventDetectionService {
  marketLeverageRepository: MarketLeverageRepository
  marketContractsRepository: MarketContractsRepository

  constructor(MarketLeverageRepository: MarketLeverageRepository, marketContractsRepository: MarketContractsRepository) {
    this.marketLeverageRepository = MarketLeverageRepository
    this.marketContractsRepository = marketContractsRepository
  }

  async runDetection(provider: JsonRpcProvider, startingBlock: number, endingBlock: number) {
    try {
      const marketContracts: AddressLike[] = (await this.marketContractsRepository.getContracts()).map((contract) => contract.contract_address as AddressLike)

      const { zapLeverageLogs, leverageLogs } = await fetchMarketLeverageLogs(provider, startingBlock, endingBlock, marketContracts)

      await this.marketLeverageRepository.insertLeverages(leverageLogs)
      await this.marketLeverageRepository.insertZapLeverages(zapLeverageLogs)
    } catch (error) {
      throw new Error(`Failed to detect leverage actions: ${(error as Error).message}`)
    }
  }
}
