import { Prisma } from "@prisma/client"
import { AbstractRepository } from "../AbstractRepository.js"

export class BoostRepository extends AbstractRepository {
  async getActiveBoosts() {
    return await this.prismaClient.user_boost.findMany({
      // Ensute that it's getting only active boosts
      where: { end_at: { equals: null } },
      distinct: ["user_address"],
      orderBy: [
        { user_address: "asc" },
        { start_at: "desc" }, // ensures latest boost per user
      ],
    })
  }

  async getUsersBoost(users: string[]) {
    return await this.prismaClient.user_boost.findMany({
      // Ensute that it's getting only active boosts
      where: { end_at: { equals: null }, user_address: { in: users } },
      select: { user_address: true, multiplier: true },
    })
  }

  async deleteUserBoosts(ids: bigint[]) {
    await this.prismaClient.user_boost.deleteMany({
      where: {
        id: {
          in: ids,
        },
      },
    })
  }

  async insertUserBoosts(userBoosts: Prisma.user_boostCreateManyInput[]) {
    await this.prismaClient.user_boost.createMany({
      data: userBoosts,
    })
  }

  async getOffChainBoostUsers() {
    return await this.prismaClient.offchain_boost_user.findMany({ select: { type: true, user_address: true } })
  }

  async getBoostSubscribers() {
    return await this.prismaClient.boost_subscribers.findMany({ select: { user_address: true } })
  }
}
