import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository"

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
    return await this.prismaClient.offchain_boost_user.findMany()
  }
}
