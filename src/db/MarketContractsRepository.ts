import { AddressLike } from "ethers"
import { AbstractRepository } from "./AbstractRepository"
import { market_contracts, Prisma } from "@prisma/client"

export class MarketContractsRepository extends AbstractRepository {
  getContracts = async () => {
    const contracts = await this.prismaClient.market_contracts.findMany()
    return contracts
  }

  getContractsInList = async (contractAddresses: AddressLike[]) => {
    const contracts = await this.prismaClient.market_contracts.findMany({
      where: { contract_address: { in: contractAddresses.map((c) => c.toString()) } },
    })
    return contracts
  }

  insertContracts = async (contracts: Prisma.market_contractsCreateInput[]) => {
    await this.prismaClient.market_contracts.createMany({
      data: contracts,
    })
  }
}
