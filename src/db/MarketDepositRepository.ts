import { AbstractRepository } from "./AbstractRepository"
import { AddressLike } from "ethers"

export class MarketDepositRepository extends AbstractRepository {
  async insertBorrows(
    data: {
      market: AddressLike
      account: AddressLike
      receiver: AddressLike
      borrowedAmount: string
      timestamp: Date
      blockId: number
    }[]
  ) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        market: d.market.toString().toLowerCase(),
        account: d.account.toString().toLowerCase(),
        receiver: d.receiver.toString().toLowerCase(),
        borrowed_amount: d.borrowedAmount.toString(),
        block_date: d.timestamp,
        block_id: d.blockId,
      }
    })

    if (toInsert.length > 0) {
      await prisma.market_borrow.createMany({
        data: toInsert,
      })
    }
  }

  async insertDeposits(
    data: {
      market: AddressLike
      account: AddressLike
      stakedAmount: string
      timestamp: Date
      blockId: number
    }[]
  ) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        market: d.market.toString().toLowerCase(),
        account: d.account.toString().toLowerCase(),
        staked_amount: d.stakedAmount.toString(),
        block_date: d.timestamp,
        block_id: d.blockId,
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
      market: AddressLike
      account: AddressLike
      stakedAmount: string
      tokenIn: AddressLike
      amountIn: string
      timestamp: Date
      blockId: number
    }[]
  ) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        market: d.market.toString().toLowerCase(),
        account: d.account.toString().toLowerCase(),
        staked_amount: d.stakedAmount,
        token_in: (d.tokenIn as string).toLowerCase(),
        amount_in: d.amountIn,
        block_date: d.timestamp,
        block_id: d.blockId,
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
      market: AddressLike
      account: AddressLike
      stakedAmount: string
      borrowAmount: string
      timestamp: Date
      blockId: number
    }[]
  ) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        market: d.market.toString().toLowerCase(),
        account: d.account.toString().toLowerCase(),
        staked_amount: d.stakedAmount.toString(),
        borrow_amount: d.borrowAmount.toString(),
        block_date: d.timestamp,
        block_id: d.blockId,
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
      market: AddressLike
      account: AddressLike
      stakedAmount: string
      borrowAmount: string
      tokenIn: AddressLike
      amountIn: string
      timestamp: Date
      blockId: number
    }[]
  ) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        market: d.market.toString().toLowerCase(),
        account: d.account.toString().toLowerCase(),
        staked_amount: d.stakedAmount.toString(),
        borrow_amount: d.borrowAmount.toString(),
        token_in: (d.tokenIn as string).toLowerCase(),
        amount_in: d.amountIn.toString(),
        block_date: d.timestamp,
        block_id: d.blockId,
      }
    })

    if (toInsert.length > 0) {
      await prisma.market_zap_deposit_and_borrow.createMany({
        data: toInsert,
      })
    }
  }
}
