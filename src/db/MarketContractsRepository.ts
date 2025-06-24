import { AbstractRepository } from "./AbstractRepository"
import { market_contracts as MarketContracts } from "@prisma/client"

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

  insertContract = async (contract: MarketContracts) => {
    await this.prismaClient.market_contracts.create({
      data: contract,
    })
  }

  insertContracts = async (contracts: MarketContracts[]) => {
    await this.prismaClient.market_contracts.createMany({
      data: contracts,
      skipDuplicates: true,
    })
  }
}
