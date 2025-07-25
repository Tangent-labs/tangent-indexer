import { AddressLike, JsonRpcProvider } from "ethers"
import { MarketContractsRepository } from "../../db/MarketContractsRepository"
import { fetchMarketCreationLogs } from "../../eventFectcher/marketCreationEventFectcher"
import * as usgContractAddresses from "../../addresses.json"

export class MarketCreationService {
  marketContractsRepository: MarketContractsRepository
  marketCreatorAddress: AddressLike

  constructor(marketContractsRepository: MarketContractsRepository, marketCreatorAddress: AddressLike) {
    this.marketContractsRepository = marketContractsRepository
    this.marketCreatorAddress = marketCreatorAddress
  }

  async runDetection(provider: JsonRpcProvider, startingBlock: number, endingBlock: number) {
    // Fetch logs from MarketCreator
    let marketsCreated = await fetchMarketCreationLogs(provider, startingBlock, endingBlock, usgContractAddresses.utilities.marketCreator)

    // If some logs are coming from MarketCreator, we insert them in db
    if (marketsCreated.length) {
      marketsCreated = marketsCreated.map((m) => {
        return {
          ...m,
          collateral_address: m.collateral_address.toLocaleLowerCase(),
          contract_address: m.contract_address.toLocaleLowerCase(),
        }
      })
      await this.marketContractsRepository.insertContracts(marketsCreated)
    }
  }

  /**
   * Retrieves all the markets in the market table
   * @returns   An object composed of a map  (marketAddress => marketID)
   *          AND
   *            The list of all market addresses
   */
  async getMarketsAddressesAndMap() {
    // Get all market addresses after
    const marketContracts = await this.marketContractsRepository.getContracts()

    const mapMarketIdAddresses = new Map<string, number>()

    marketContracts.forEach((market) => {
      mapMarketIdAddresses.set(market.contract_address, Number(market.id))
    })

    const marketAddresses = marketContracts.map((market) => market.contract_address as AddressLike)

    return {
      mapMarketIdAddresses,
      marketAddresses,
    }
  }
}
