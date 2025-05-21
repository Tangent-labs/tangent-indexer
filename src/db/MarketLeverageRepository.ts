import { AbstractRepository } from "./AbstractRepository"
import { AddressLike } from "ethers"

export class MarketLeverageRepository extends AbstractRepository {
  async insertLeverages(
    data: {
      account: AddressLike
      stakedAmount: string
      collatBought: string
      borrowedAmount: string
      timestamp: Date
    }[]
  ) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        account: (d.account as string).toLowerCase(),
        stakedAmount: d.stakedAmount,
        collatBought: d.collatBought,
        borrowedAmount: d.borrowedAmount,
        check_date: d.timestamp,
      }
    })

    if (toInsert.length > 0) {
      await prisma.market_leverage.createMany({
        data: toInsert,
      })
    }
  }

  async insertZapLeverages(
    data: {
      account: AddressLike
      stakedAmount: string
      collatZapDeposit: string
      collatLeverage: string
      borrowedAmount: string
      tokenIn: string
      amountIn: string
      timestamp: Date
    }[]
  ) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        account: (d.account as string).toLowerCase(),
        stakedAmount: d.stakedAmount.toString(),
        collatZapDeposit: d.collatZapDeposit.toString(),
        collatLeverage: d.collatLeverage.toString(),
        borrowedAmount: d.borrowedAmount.toString(),
        tokenIn: (d.tokenIn as string).toString(),
        amountIn: d.amountIn.toString(),
        check_date: d.timestamp,
      }
    })

    if (toInsert.length > 0) {
      await prisma.market_zap_leverage.createMany({
        data: toInsert,
      })
    }
  }
}
