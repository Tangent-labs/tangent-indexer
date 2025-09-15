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

  async getTrackedERC20In(erc20Names: string[]) {
    return await this.prismaClient.tracked_erc20.findMany({
      where: {
        name: {
          in: erc20Names,
        },
      },
    })
  }

  async insertTotalSupplies(totalSupplies: Prisma.total_suppliesCreateManyInput[]) {
    await this.prismaClient.total_supplies.createMany({
      data: totalSupplies,
    })
  }

  async updateTotalSupplies(totalSupplies: Prisma.total_suppliesCreateManyInput[]) {
    await this.prismaClient.total_supplies.createMany({
      data: totalSupplies,
    })
  }
}
