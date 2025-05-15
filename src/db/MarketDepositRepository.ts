import { AbstractRepository } from "./AbstractRepository"
import { AddressLike } from "ethers"

export class MarketDepositRepository extends AbstractRepository {
  async updateDeposits(data: { depositer: AddressLike; market: AddressLike; stakedAmount: string }[]) {
    const prisma = this.prismaClient

    const currentDepositers = await prisma.market_deposit.findMany({
      select: { depositer: true, address: true, staked_amount: true },
    })

    const existingDataMap = new Map(currentDepositers.map((d) => [`${d.depositer}-${d.address}-${d.staked_amount}`, d]))

    const toInsert = data
      .filter((d) => !existingDataMap.has(`${d.depositer}-${d.market}-${d.stakedAmount}`))
      .map((d) => {
        return {
          depositer: (d.depositer as string).toLowerCase(),
          address: (d.market as string).toLowerCase(),
          staked_amount: d.stakedAmount.toString(),
          check_date: new Date(),
        }
      })

    if (toInsert.length > 0) {
      await prisma.market_deposit.createMany({
        data: toInsert,
      })
    }
  }

  async updateZapDeposits(
    data: {
      depositer: AddressLike
      market: AddressLike
      stakedAmount: string
      tokenIn: AddressLike
      amountIn: string
    }[]
  ) {
    const prisma = this.prismaClient

    const currentDepositers = await prisma.market_zap_deposit.findMany({
      select: {
        depositer: true,
        address: true,
      },
    })

    const existingDataMap = new Map(currentDepositers.map((d) => [`${d.depositer}-${d.address}`, d]))

    const toInsert = data
      .filter((d) => !existingDataMap.has(`${d.depositer}-${d.market}`))
      .map((d) => {
        return {
          depositer: (d.depositer as string).toLowerCase(),
          address: (d.market as string).toLowerCase(),
          staked_amount: d.stakedAmount,
          token_in: (d.tokenIn as string).toLowerCase(),
          amount_in: d.amountIn,
          check_date: new Date(),
        }
      })

    if (toInsert.length > 0) {
      await prisma.market_zap_deposit.createMany({
        data: toInsert,
      })
    }
  }
}
