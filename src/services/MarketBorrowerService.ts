import { AddressLike, JsonRpcProvider } from "ethers"

import { MarketBorrowerRepository } from "../db/MarketBorrowerRepository"
import { MarketContractsRepository } from "../db/MarketContractsRepository"
import { fetchBorrowLogs } from "../eventFectcher/marketBorrowerEventFetcher"
import { EventDetectionService } from "../type/service"

export class MarketBorrowerService implements EventDetectionService {
  marketBorrowerRepository: MarketBorrowerRepository
  marketContractsRepository: MarketContractsRepository

  constructor(marketBorrowerRepository: MarketBorrowerRepository, marketContractsRepository: MarketContractsRepository) {
    this.marketContractsRepository = marketContractsRepository
    this.marketBorrowerRepository = marketBorrowerRepository
  }

  async runDetection(provider: JsonRpcProvider, startingBlock: number, endingBlock: number) {
    // laod the markets from the database
    const marketContracts: AddressLike[] = (await this.marketContractsRepository.getContracts()).map((contract) => contract.contract_address as AddressLike)

    // fetch the logs
    const logs = await fetchBorrowLogs(provider, startingBlock, endingBlock, marketContracts)
    if (logs.length === 0) return

    // insert new borrower.
    await this.marketBorrowerRepository.updateMarketBorrowers(logs.map((log) => ({ borrower: log.borrower, market: log.market })))
  }
}
