import { AbstractRepository } from "./AbstractRepository"
import { AddressLike } from "ethers"

export class MarketRepayRepository extends AbstractRepository {
  async insertWithdraws(data: { account: AddressLike; withdrawnAmount: string; timestamp: Date }[]) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        account: (d.account as string).toLowerCase(),
        withdrawnAmount: d.withdrawnAmount.toString(),
        check_date: d.timestamp,
      }
    })

    if (toInsert.length > 0) {
      await prisma.market_withdraw.createMany({
        data: toInsert,
      })
    }
  }

  async insertRepays(data: { repayer: AddressLike; repaidAmount: string; timestamp: Date }[]) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        userAddress: (d.repayer as string).toLowerCase(),
        repayer: (d.repayer as string).toLowerCase(),
        repaidAmount: d.repaidAmount.toString(),
        check_date: d.timestamp,
      }
    })

    if (toInsert.length > 0) {
      await prisma.market_repay.createMany({
        data: toInsert,
      })
    }
  }

  async insertRepayAndWithdraw(
    data: {
      userAddress: AddressLike
      repaidAmount: string
      withdrawnAmount: string
      timestamp: Date
    }[]
  ) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        userAddress: d.userAddress.toString(),
        repaidAmount: d.repaidAmount.toString(),
        withdrawnAmount: d.withdrawnAmount.toString(),
        check_date: d.timestamp,
      }
    })

    if (toInsert.length > 0) {
      await prisma.market_repay_and_withdraw.createMany({
        data: toInsert,
      })
    }
  }

  async insertZapRepays(
    data: {
      repayer: AddressLike
      repaidAmount: string
      tokenIn: AddressLike
      amountIn: string
      timestamp: Date
    }[]
  ) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        repayer: (d.repayer as string).toLowerCase(),
        userAddress: (d.repayer as string).toLowerCase(),
        repaidAmount: d.repaidAmount.toString(),
        token_in: (d.tokenIn as string).toLowerCase(),
        amount_in: d.amountIn.toString(),
        check_date: d.timestamp,
      }
    })

    if (toInsert.length > 0) {
      await prisma.market_zap_repay.createMany({
        data: toInsert,
      })
    }
  }

  async insertZapRepayAndWithdraw(
    data: {
      repayer: AddressLike
      repaidAmount: string
      withdrawnAmount: string
      tokenIn: AddressLike
      amountIn: string
      timestamp: Date
    }[]
  ) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        userAddress: (d.repayer as string).toLowerCase(),
        repaidAmount: d.repaidAmount.toString(),
        withdrawnAmount: d.withdrawnAmount.toString(),
        token_in: (d.tokenIn as string).toLowerCase(),
        amount_in: d.amountIn.toString(),
        check_date: d.timestamp,
      }
    })

    if (toInsert.length > 0) {
      await prisma.market_zap_repay_and_withdraw.createMany({
        data: toInsert,
      })
    }
  }
}
