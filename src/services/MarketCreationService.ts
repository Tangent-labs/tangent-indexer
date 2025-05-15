import { AddressLike, JsonRpcProvider } from "ethers"
import { MarketContractsRepository } from "../db/MarketContractsRepository"
import { fetchMarketCreationLogs } from "../eventFectcher/marketCreationEventFectcher"
import { EventDetectionService } from "../type/service"
import { market_contracts } from "@prisma/client"

export class MarketCreationService implements EventDetectionService {
  marketContractsRepository: MarketContractsRepository
  marketCreatorAddress: AddressLike

  constructor(marketContractsRepository: MarketContractsRepository, marketCreatorAddress: AddressLike) {
    this.marketContractsRepository = marketContractsRepository
    this.marketCreatorAddress = marketCreatorAddress
  }

  async runDetection(provider: JsonRpcProvider, startingBlock: number, endingBlock: number) {
    // get the constant from the config

    // fetch the logs
    const logs = await fetchMarketCreationLogs(provider, startingBlock, endingBlock, this.marketCreatorAddress)
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

      await this.marketContractsRepository.insertContracts(newData as market_contracts[])
    }
  }
}
