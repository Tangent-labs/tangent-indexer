import { AbstractRepository } from "./AbstractRepository"
import { Prisma } from "@prisma/client"
import { UserAction } from "../services/events/UserMarketService"
export class ActiveBorrowersRepository extends AbstractRepository {
  async insertActiveBorrowers(userActions: UserAction[]) {
    const activeBorrowers: Prisma.active_borrowersCreateManyInput[] = userActions.map((userAction) => {
      return {
        borrower_address: userAction.user.toString(),
        contract_address: userAction.market.toString(),
        block_date: userAction.timestamp,
      }
    })

    await this.prismaClient.active_borrowers.createMany({
      data: activeBorrowers,
    })
  }

  async deleteActiveBorrowers(userActions: UserAction[]) {
    const where = {
      AND: userActions.map((userAction) => ({
        borrower_address: { equals: userAction.user, mode: "insensitive" },
        contract_address: { equals: userAction.market, mode: "insensitive" },
      })),
    } as Prisma.active_borrowersWhereInput

    await this.prismaClient.active_borrowers.deleteMany({
      where,
    })
  }
}
