import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository.js"

export class RevenuesRepository extends AbstractRepository {
  /* =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-=
                        GET
    =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-= */

  async getRevenuesTokens() {
    return await this.prismaClient.revenues_tokens.findMany()
  }

  async getUSGMintedInterests(from: Date, to: Date) {
    return await this.prismaClient.checkpoint_ir.findMany({
      where: {
        block_date: {
          gte: from,
          lte: to,
        },
      },
    })
  }

  async getRewardCuts(from: Date, to: Date) {
    return await this.prismaClient.reward_notified.findMany({
      where: {
        block_date: {
          gte: from,
          lte: to,
        },
      },
    })
  }

  async getRewardTokenPrices(from: Date, to: Date) {
    return await this.prismaClient.revenues_token_prices.findMany({
      where: {
        day: {
          gte: from,
          lte: to,
        },
      },
      include: {
        token: true,
      },
    })
  }

  async getDailyRevenues(from: Date, to: Date) {
    return await this.prismaClient.daily_revenues.findMany({
      where: {
        day: {
          gte: from,
          lte: to,
        },
      },
    })
  }

  async getDailyRevenuesMarket(from: Date, to: Date) {
    return await this.prismaClient.daily_revenues_market.findMany({
      where: {
        day: {
          gte: from,
          lte: to,
        },
      },
    })
  }

  /* =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-=
                        SAVE
    =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-= */

  async saveCheckpointIRs(checkpointIR: Prisma.checkpoint_irCreateManyInput[]) {
    await this.prismaClient.checkpoint_ir.createMany({
      data: checkpointIR,
    })
  }

  async saveRewardDistributed(rewardNotified: Prisma.reward_notifiedCreateManyInput[]) {
    await this.prismaClient.reward_notified.createMany({
      data: rewardNotified,
    })
  }

  async saveRewardTokenPrices(tokenPrices: Prisma.revenues_token_pricesCreateManyInput[]) {
    await this.prismaClient.revenues_token_prices.createMany({
      data: tokenPrices,
    })
  }

  /**
   * @notice  Overwrites daily_revenues rows for the given days, since the table has no unique
   *          constraint on `day` and D0 gets recomputed on every run until the day is closed
   */
  async saveDailyRevenues(dailyRevenues: Prisma.daily_revenuesCreateManyInput[]) {
    const days = dailyRevenues.map((r) => r.day as Date)
    await this.prismaClient.daily_revenues.deleteMany({
      where: {
        day: {
          in: days,
        },
      },
    })
    await this.prismaClient.daily_revenues.createMany({
      data: dailyRevenues,
    })
  }

  /**
   * @notice  Overwrites daily_revenues_market rows for the given days, same reasoning as saveDailyRevenues
   */
  async saveDailyRevenuesMarket(dailyRevenuesMarket: Prisma.daily_revenues_marketCreateManyInput[]) {
    const days = dailyRevenuesMarket.map((r) => r.day as Date)
    await this.prismaClient.daily_revenues_market.deleteMany({
      where: {
        day: {
          in: days,
        },
      },
    })
    await this.prismaClient.daily_revenues_market.createMany({
      data: dailyRevenuesMarket,
    })
  }
}
