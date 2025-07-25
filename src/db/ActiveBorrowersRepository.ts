import { AbstractRepository } from "./AbstractRepository"
import { Prisma } from "@prisma/client"
import { UserAction } from "../services/events/UserMarketService"
export class ActiveBorrowersRepository extends AbstractRepository {
  async getAll() {
    return await this.prismaClient.active_borrowers.findMany({
      select: {
        market: true,
        borrower_address: true,
      },
    })
  }

  async insertActiveBorrowers(userActions: UserAction[]) {
    const activeBorrowers: Prisma.active_borrowersCreateManyInput[] = userActions.map((userAction) => {
      return {
        borrower_address: userAction.user.toString(),
        market_id: userAction.marketId,
        block_date: userAction.timestamp,
        debt_shares: userAction.debt_shares.toString(),
      }
    })

    await this.prismaClient.active_borrowers.createMany({
      data: activeBorrowers,
    })
  }

  async deleteActiveBorrowers(userActions: UserAction[]) {
    const where = {
      OR: userActions.map((userAction) => ({
        borrower_address: { equals: userAction.user, mode: "insensitive" },
        market_id: { equals: userAction.marketId, mode: "insensitive" },
      })),
    } as Prisma.active_borrowersWhereInput

    await this.prismaClient.active_borrowers.deleteMany({
      where,
    })
  }
}
