import { AbstractRepository } from "./AbstractRepository"
import { MarketContract } from "type/prisma"
import { MarketCreationEvent } from "eventFectcher/marketCreationEventFectcher"

export class MarketContractsRepository extends AbstractRepository {
  getContracts = async () => {
    const contracts = await this.prismaClient.market_contracts.findMany()
    return contracts
  }

  insertContract = async (contract: any) => {
    await this.prismaClient.market_contracts.create({
      data: contract,
    })
  }

  insertNonExistingContractsFromLogs = async (logs: MarketCreationEvent[]) => {
    const contracts = logs.map((log) => log.address)

    // Query the existing contracts
    const existingContracts = await this.prismaClient.market_contracts.findMany({
      select: { contract_address: true },
      where: { contract_address: { in: contracts as string[] } },
    })

    // use "Set" for performance
    const existingContractAddresses = new Set(existingContracts.map((c) => c.contract_address))

    // make the difference
    const newContracts = contracts.filter((contract) => !existingContractAddresses.has(contract as string))
    if (!newContracts.length) return 0

    // crete the new data for DB
    const newData = newContracts
      .map((contract) => {
        return {
          ...logs.find((log) => log.address === contract),
        }
      })
      .map((log) => ({ contract_address: log.address, contract_type: log.marketType })) as MarketContract[]

    // insert the new contracts
    await this.insertContracts(newData)
    return newContracts.length
  }

  insertContracts = async (contracts: MarketContract[]) => {
    await this.prismaClient.market_contracts.createMany({
      data: contracts,
    })
  }
}
