import { AbstractRepository } from "./AbstractRepository"
import { Prisma } from "@prisma/client"

export class MarketContractsRepository extends AbstractRepository {
  getContracts = async () => {
    const contracts = await this.prismaClient.market_creations.findMany()
    return contracts
  }

  insertContracts = async (contracts: Prisma.market_creationsCreateInput[]) => {
    await this.prismaClient.market_creations.createMany({
      data: contracts,
    })
  }
}
