import { JsonRpcProvider, AddressLike } from "ethers"
import { MarketContractsRepository } from "../db/MarketContractsRepository"
import { EventDetectionService } from "../type/service"
import { MarketLiquidateRepository } from "db/MarketLiquidateRepository"
import { fetchMarketLiquidateLogs } from "eventFectcher/marketLiquidateEventFetcher"

export class MarketLiquidationService implements EventDetectionService {
  marketLiquidateRepository: MarketLiquidateRepository
  marketContractsRepository: MarketContractsRepository

  constructor(MarketLiquidateRepository: MarketLiquidateRepository, marketContractsRepository: MarketContractsRepository) {
    this.marketLiquidateRepository = MarketLiquidateRepository
    this.marketContractsRepository = marketContractsRepository
  }

  async runDetection(provider: JsonRpcProvider, startingBlock: number, endingBlock: number) {
    try {
      const marketContracts: AddressLike[] = (await this.marketContractsRepository.getContracts()).map((contract) => contract.contract_address as AddressLike)

      const { liquidateLogs, selfLiquidateLogs } = await fetchMarketLiquidateLogs(provider, startingBlock, endingBlock, marketContracts)

      await this.marketLiquidateRepository.insertLiquidations(liquidateLogs)
      await this.marketLiquidateRepository.insertSelfLiquidations(selfLiquidateLogs)
    } catch (error) {
      throw new Error(`Failed to detect liquidate actions: ${(error as Error).message}`)
    }
  }
}
