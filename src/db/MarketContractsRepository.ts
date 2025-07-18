import { AbstractRepository } from "./AbstractRepository"
import { Prisma } from "@prisma/client"

export class MarketContractsRepository extends AbstractRepository {
  getContracts = async () => {
    const contracts = await this.prismaClient.usg_markets.findMany()
    return contracts
  }

  insertContracts = async (contracts: Prisma.usg_marketsCreateInput[]) => {
    await this.prismaClient.usg_markets.createMany({
      data: contracts,
    })
  }
}
