import { AbstractRepository } from "./AbstractRepository"
import { AddressLike } from "ethers"

export class MarketRepayRepository extends AbstractRepository {
  async insertWithdraws(
    data: {
      market: AddressLike
      account: AddressLike
      withdrawnAmount: string
      timestamp: Date
      blockId: number
    }[]
  ) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        market: d.market.toString().toLowerCase(),
        account: d.account.toString().toLowerCase(),
        withdrawn_amount: d.withdrawnAmount.toString(),
        block_date: d.timestamp,
        block_id: d.blockId,
      }
    })

    if (toInsert.length > 0) {
      await prisma.market_withdraw.createMany({
        data: toInsert,
      })
    }
  }

  async insertRepays(
    data: {
      market: AddressLike
      account: AddressLike
      repayer: AddressLike
      repaidAmount: string
      timestamp: Date
      blockId: number
    }[]
  ) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        market: d.market.toString().toLowerCase(),
        account: d.account.toString().toLowerCase(),
        repayer: d.repayer.toString().toLowerCase(),
        repaid_amount: d.repaidAmount.toString(),
        block_date: d.timestamp,
        block_id: d.blockId,
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
      market: AddressLike
      account: AddressLike
      repaidAmount: string
      withdrawnAmount: string
      timestamp: Date
      blockId: number
    }[]
  ) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        market: d.market.toString().toLowerCase(),
        account: d.account.toString(),
        repaid_amount: d.repaidAmount.toString(),
        withdrawn_amount: d.withdrawnAmount.toString(),
        block_date: d.timestamp,
        block_id: d.blockId,
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
      market: AddressLike
      account: AddressLike
      repayer: AddressLike
      repaidAmount: string
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
        repayer: d.repayer.toString().toLowerCase(),
        repaid_amount: d.repaidAmount.toString(),
        token_in: (d.tokenIn as string).toLowerCase(),
        amount_in: d.amountIn.toString(),
        block_date: d.timestamp,
        block_id: d.blockId,
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
      market: AddressLike
      account: AddressLike
      repaidAmount: string
      withdrawnAmount: string
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
        repaid_amount: d.repaidAmount.toString(),
        withdrawn_amount: d.withdrawnAmount.toString(),
        token_in: d.tokenIn.toString().toLowerCase(),
        amount_in: d.amountIn.toString(),
        block_date: d.timestamp,
        block_id: d.blockId,
      }
    })

    if (toInsert.length > 0) {
      await prisma.market_zap_repay_and_withdraw.createMany({
        data: toInsert,
      })
    }
  }
}
