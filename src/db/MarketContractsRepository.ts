import { Prisma } from "@prisma/client"

import { AbstractRepository } from "./AbstractRepository"

export class MarketContractsRepository extends AbstractRepository {
  async getContracts() {
    const contracts = await this.prismaClient.usg_markets.findMany()
    return contracts
  }

  async insertContracts(contracts: Prisma.usg_marketsCreateInput[]) {
    await this.prismaClient.usg_markets.createMany({
      data: contracts,
    })
  }
}
