import { AbstractRepository } from "./AbstractRepository"
import { AddressLike } from "ethers"

export class MarketDepositRepository extends AbstractRepository {
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
}
