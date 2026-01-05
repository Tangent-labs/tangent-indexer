import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository.js"

export class UserEventsRepository extends AbstractRepository {
  async insertBorrows(events: Prisma.borrowCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.borrow.createMany({
        data: events,
      })
    }
  }

  async insertDeposits(events: Prisma.depositCreateManyInput[]) {
    try {
      if (events.length > 0) {
        await this.prismaClient.deposit.createMany({
          data: events,
        })
      }
    } catch (error) {
      console.error("error inserting deposits", events.length)
    }
  }

  async insertZapDeposits(events: Prisma.zap_depositCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.zap_deposit.createMany({
        data: events,
      })
    }
  }

  async insertDepositAndBorrows(events: Prisma.deposit_and_borrowCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.deposit_and_borrow.createMany({
        data: events,
      })
    }
  }

  async insertZapDepositAndBorrows(events: Prisma.zap_deposit_and_borrowCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.zap_deposit_and_borrow.createMany({
        data: events,
      })
    }
  }

  async insertWithdraws(events: Prisma.withdrawCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.withdraw.createMany({
        data: events,
      })
    }
  }

  async insertRepays(events: Prisma.repayCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.repay.createMany({
        data: events,
      })
    }
  }

  async insertZapRepays(events: Prisma.zap_repayCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.zap_repay.createMany({
        data: events,
      })
    }
  }

  async insertRepayAndWithdraws(events: Prisma.repay_and_withdrawCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.repay_and_withdraw.createMany({
        data: events,
      })
    }
  }

  async insertZapRepayAndWithdraws(events: Prisma.zap_repay_and_withdrawCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.zap_repay_and_withdraw.createMany({
        data: events,
      })
    }
  }

  async insertLeverages(events: Prisma.leverageCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.leverage.createMany({
        data: events,
      })
    }
  }

  async insertZapLeverages(events: Prisma.zap_leverageCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.zap_leverage.createMany({
        data: events,
      })
    }
  }

  async insertLiquidations(events: Prisma.liquidateCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.liquidate.createMany({
        data: events,
      })
    }
  }

  async insertSelfLiquidations(events: Prisma.self_liquidateCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.self_liquidate.createMany({
        data: events,
      })
    }
  }

  async insertSeizeCollateral(events: Prisma.seize_collateralCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.seize_collateral.createMany({
        data: events,
      })
    }
  }

  async insertMigrateFrom(events: Prisma.migrate_fromCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.migrate_from.createMany({
        data: events,
      })
    }
  }

  async insertMigrateTo(events: Prisma.migrate_toCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.migrate_to.createMany({
        data: events,
      })
    }
  }
}
