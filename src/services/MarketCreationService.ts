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
    const marketCreatorAddress: AddressLike = indexerConfig.contracts.marketCreatorAddress

    // fetch the logs
    const logs = await fetchMarketCreationLogs(provider, startingBlock, endingBlock, marketCreatorAddress)
    if (!logs.length) {
      console.log("No market creation logs found")
      return
    }

    const addresses = logs.map((log) => log.address) as string[]
    const existingContracts = await this.marketContractsRepository.getContractsInList(addresses)
    const newContracts = addresses.filter((address) => !existingContracts.some((contract) => contract.contract_address === address))
    // Insert the new contracts

    if (newContracts.length) {
      const newData = newContracts
        .map((contract) => {
          return {
            ...logs.find((log) => log.address === contract),
          }
        })
        .map((log) => ({ contract_address: log.address, contract_type: log.marketType }))

      await this.marketContractsRepository.insertContracts(newData as { contract_address: string; contract_type: string }[])
    }
  }
}
