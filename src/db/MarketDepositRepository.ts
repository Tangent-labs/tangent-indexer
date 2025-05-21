import { AbstractRepository } from "./AbstractRepository"
import { AddressLike } from "ethers"

export class MarketDepositRepository extends AbstractRepository {
  async insertBorrows(data: { account: AddressLike; borrowedAmount: string; timestamp: Date }[]) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        account: (d.account as string).toLowerCase(),
        receiver: (d.account as string).toLowerCase(),
        borrowedAmount: d.borrowedAmount.toString(),
        check_date: d.timestamp,
      }
    })

    if (toInsert.length > 0) {
      await prisma.market_borrow.createMany({
        data: toInsert,
      })
    }
  }

  async insertDeposits(data: { depositer: AddressLike; market: AddressLike; stakedAmount: string; timestamp: Date }[]) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        depositer: (d.depositer as string).toLowerCase(),
        userAddress: (d.market as string).toLowerCase(),
        staked_amount: d.stakedAmount.toString(),
        check_date: d.timestamp,
      }
    })

    if (toInsert.length > 0) {
      await prisma.market_deposit.createMany({
        data: toInsert,
      })
    }
  }

  async insertZapDeposits(
    data: {
      depositer: AddressLike
      market: AddressLike
      stakedAmount: string
      tokenIn: AddressLike
      amountIn: string
      timestamp: Date
    }[]
  ) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        depositer: (d.depositer as string).toLowerCase(),
        userAddress: (d.market as string).toLowerCase(),
        staked_amount: d.stakedAmount,
        token_in: (d.tokenIn as string).toLowerCase(),
        amount_in: d.amountIn,
        check_date: d.timestamp,
      }
    })

    if (toInsert.length > 0) {
      await prisma.market_zap_deposit.createMany({
        data: toInsert,
      })
    }
  }

  async insertDepositAndBorrow(
    data: {
      depositer: AddressLike
      market: AddressLike
      stakedAmount: string
      borrowAmount: string
      timestamp: Date
    }[]
  ) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        depositer: (d.depositer as string).toLowerCase(),
        userAddress: (d.market as string).toLowerCase(),
        staked_amount: d.stakedAmount.toString(),
        borrow_amount: d.borrowAmount.toString(),
        check_date: d.timestamp,
      }
    })

    if (toInsert.length > 0) {
      await prisma.market_deposit_and_borrow.createMany({
        data: toInsert,
      })
    }
  }

  async insertZapDepositAndBorrow(
    data: {
      depositer: AddressLike
      market: AddressLike
      stakedAmount: string
      borrowAmount: string
      tokenIn: AddressLike
      amountIn: string
      timestamp: Date
    }[]
  ) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        depositer: (d.depositer as string).toLowerCase(),
        userAddress: (d.market as string).toLowerCase(),
        staked_amount: d.stakedAmount.toString(),
        borrow_amount: d.borrowAmount.toString(),
        token_in: (d.tokenIn as string).toLowerCase(),
        amount_in: d.amountIn.toString(),
        check_date: d.timestamp,
      }
    })

    if (toInsert.length > 0) {
      await prisma.market_zap_deposit_and_borrow.createMany({
        data: toInsert,
      })
    }
  }
}
