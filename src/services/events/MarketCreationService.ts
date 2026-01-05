import { AddressLike, JsonRpcProvider } from "ethers"
import { MarketContractsRepository } from "../../db/MarketContractsRepository.js"
import { fetchMarketCreationLogs } from "../../eventFectcher/marketCreationEventFectcher.js"
import { UserPointsLPRepository } from "../../db/Points/UserPointsLPRepository.js"
import { PTS_PER_HOUR_TO_SECONDS_RATE } from "../../scripts/db-seed/seed_lp_tasks.js"
import { ERC20Repository } from "../../db/ERC20Repository.js"

export class MarketCreationService {
  marketContractsRepository: MarketContractsRepository
  marketCreatorAddress: AddressLike
  userPointRepository: UserPointsLPRepository
  erc20Repository: ERC20Repository

  constructor(
    marketContractsRepository: MarketContractsRepository,
    marketCreatorAddress: AddressLike,
    userPointRepository: UserPointsLPRepository,
    erc20Repository: ERC20Repository
  ) {
    this.marketContractsRepository = marketContractsRepository
    this.marketCreatorAddress = marketCreatorAddress
    this.userPointRepository = userPointRepository
    this.erc20Repository = erc20Repository
  }

  async runDetection(provider: JsonRpcProvider, startingBlock: number, endingBlock: number) {
    // Fetch logs from MarketCreator
    let marketsCreated = await fetchMarketCreationLogs(provider, startingBlock, endingBlock, this.marketCreatorAddress)
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

      if (marketsCreated.length !== 0) {
        await this.erc20Repository.insertManyERC20ToTrack(
          marketsCreated.map((market) => ({
            address: market.contract_address.toLowerCase(),
            name: "Debt on " + market.contract_name,
            symbol: "Debt on " + market.contract_name,
          }))
        )

        const priceFeeds = await this.erc20Repository.insertAndReturnManyPriceSource(
          marketsCreated.map((market) => ({
            address: market.contract_address.toLowerCase(),
            name: "Market " + market.contract_name,
            type: "market",
          }))
        )

        await this.userPointRepository.insertLpTasks(
          marketsCreated.map((market, i) => ({
            price_source_id: priceFeeds[i].id,
            name: "Debt on " + market.contract_name,
            action_type: "Borrow",
            description: "Have some debt on " + market.contract_name,
            point_rate: PTS_PER_HOUR_TO_SECONDS_RATE[5],
            protocol: "Tangent",
            token_address: market.contract_address.toLowerCase(),
            url: "usg.tangent.finance",
          }))
        )
      }
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
      mapMarketIdAddresses.set(market.contract_address.toLowerCase(), Number(market.id))
    })

    const marketAddresses = marketContracts.map((market) => market.contract_address as AddressLike)

    return {
      mapMarketIdAddresses,
      marketAddresses,
    }
  }
}
