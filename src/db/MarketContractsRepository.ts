import { AbstractRepository } from "./AbstractRepository"

export interface MarketContract {
  contract_address: string
  contract_type: string
}

export class MarketContractsRepository extends AbstractRepository {
  getContracts = async () => {
    const contracts = await this.prismaClient.market_contracts.findMany()
    return contracts
  }

  getContractsInList = async (contractAddresses: string[]) => {
    const contracts = await this.prismaClient.market_contracts.findMany({
      where: { contract_address: { in: contractAddresses } },
    })
    return contracts
  }

  insertContract = async (contract: MarketContract) => {
    await this.prismaClient.market_contracts.create({
      data: contract,
    })
  }

  insertContracts = async (contracts: MarketContract[]) => {
    await this.prismaClient.market_contracts.createMany({
      data: contracts,
      skipDuplicates: true,
    })
  }
}
