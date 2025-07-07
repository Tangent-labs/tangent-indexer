import { AddressLike } from "ethers"
import { AbstractRepository } from "./AbstractRepository"
import { Prisma } from "@prisma/client"

export class MarketContractsRepository extends AbstractRepository {
  getContracts = async () => {
    const contracts = await this.prismaClient.market_contracts.findMany()
    return contracts
  }

  insertContracts = async (contracts: Prisma.market_contractsCreateInput[]) => {
    await this.prismaClient.market_contracts.createMany({
      data: contracts,
    })
  }
}
