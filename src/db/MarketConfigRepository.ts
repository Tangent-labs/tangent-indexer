import { Prisma, PrismaClient } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository.js"
import { TransactionPrisma } from "../type/prisma.js"

export class MarketConfigRepository extends AbstractRepository {
  async saveMarketConfigs(configs: Prisma.market_configCreateManyInput[]) {
    if (!configs.length) return
    const marketIds = configs.map((c) => c.market_id as bigint)

    await (this.prismaClient as PrismaClient).$transaction(async (dbTransaction: TransactionPrisma) => {
      this.setClient(dbTransaction)
      await this.prismaClient.market_config.deleteMany({ where: { market_id: { in: marketIds } } })
      await this.prismaClient.market_config.createMany({ data: configs })
    })
  }

  async getLastUpdateDate() {
    return await this.prismaClient.market_config.findFirst({
      orderBy: {
        last_update: "desc",
      },
      select: {
        last_update: true,
      },
    })
  }
}
