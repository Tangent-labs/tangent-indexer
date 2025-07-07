import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository"

export class UserEventsRepository extends AbstractRepository {
  async insertBorrows(events: Prisma.market_borrowCreateInput[]) {
    if (events.length > 0) {
      await this.prismaClient.market_borrow.createMany({
        data: events,
      })
    }
  }
  async insertDeposits(events: Prisma.market_depositCreateInput[]) {
    if (events.length > 0) {
      await this.prismaClient.market_deposit.createMany({
        data: events,
      })
    }
  }

  async insertZapDeposits(events: Prisma.market_zap_depositCreateInput[]) {
    if (events.length > 0) {
      await this.prismaClient.market_zap_deposit.createMany({
        data: events,
      })
    }
  }

  async insertDepositAndBorrows(events: Prisma.market_deposit_and_borrowCreateInput[]) {
    if (events.length > 0) {
      await this.prismaClient.market_deposit_and_borrow.createMany({
        data: events,
      })
    }
  }
  async insertZapDepositAndBorrows(events: Prisma.market_zap_deposit_and_borrowCreateInput[]) {
    if (events.length > 0) {
      await this.prismaClient.market_zap_deposit_and_borrow.createMany({
        data: events,
      })
    }
  }

  async insertWithdraws(events: Prisma.market_withdrawCreateInput[]) {
    if (events.length > 0) {
      await this.prismaClient.market_withdraw.createMany({
        data: events,
      })
    }
  }

  async insertRepays(events: Prisma.market_repayCreateInput[]) {
    if (events.length > 0) {
      await this.prismaClient.market_repay.createMany({
        data: events,
      })
    }
  }
  async insertZapRepays(events: Prisma.market_zap_repayCreateInput[]) {
    if (events.length > 0) {
      await this.prismaClient.market_zap_repay.createMany({
        data: events,
      })
    }
  }

  async insertRepayAndWithdraws(events: Prisma.market_repay_and_withdrawCreateInput[]) {
    if (events.length > 0) {
      await this.prismaClient.market_repay_and_withdraw.createMany({
        data: events,
      })
    }
  }

  async insertZapRepayAndWithdraws(events: Prisma.market_zap_repay_and_withdrawCreateInput[]) {
    if (events.length > 0) {
      await this.prismaClient.market_zap_repay_and_withdraw.createMany({
        data: events,
      })
    }
  }

  async insertLeverages(events: Prisma.market_leverageCreateInput[]) {
    if (events.length > 0) {
      await this.prismaClient.market_leverage.createMany({
        data: events,
      })
    }
  }

  async insertZapLeverages(events: Prisma.market_zap_leverageCreateInput[]) {
    if (events.length > 0) {
      await this.prismaClient.market_zap_leverage.createMany({
        data: events,
      })
    }
  }

  async insertLiquidations(events: Prisma.market_liquidateCreateInput[]) {
    if (events.length > 0) {
      await this.prismaClient.market_liquidate.createMany({
        data: events,
      })
    }
  }

  async insertSelfLiquidations(events: Prisma.market_self_liquidateCreateInput[]) {
    if (events.length > 0) {
      await this.prismaClient.market_self_liquidate.createMany({
        data: events,
      })
    }
  }

  async insertSeizeCollateral(events: Prisma.market_seize_collateralCreateInput[]) {
    if (events.length > 0) {
      await this.prismaClient.market_seize_collateral.createMany({
        data: events,
      })
    }
  }
}
