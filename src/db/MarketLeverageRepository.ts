import { AbstractRepository } from "./AbstractRepository"
import { AddressLike } from "ethers"

export class MarketLeverageRepository extends AbstractRepository {
  async insertLeverages(
    data: {
      market: AddressLike
      account: AddressLike
      stakedAmount: string
      collatBought: string
      borrowedAmount: string
      timestamp: Date
      blockId: number
      txHash: string
    }[]
  ) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        market: d.market.toString().toLowerCase(),
        account: d.account.toString().toLowerCase(),
        staked_amount: d.stakedAmount,
        collat_bought: d.collatBought,
        borrowed_amount: d.borrowedAmount,
        block_date: d.timestamp,
        block_id: d.blockId,
        tx_hash: d.txHash,
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
      market: AddressLike
      account: AddressLike
      stakedAmount: string
      collatZapDeposit: string
      collatLeverage: string
      borrowedAmount: string
      tokenIn: string
      amountIn: string
      timestamp: Date
      blockId: number
      txHash: string
    }[]
  ) {
    const prisma = this.prismaClient

    const toInsert = data.map((d) => {
      return {
        market: d.market.toString().toLowerCase(),
        account: d.account.toString().toLowerCase(),
        staked_amount: d.stakedAmount.toString(),
        collat_zap_deposit: d.collatZapDeposit.toString(),
        collat_leverage: d.collatLeverage.toString(),
        borrowed_amount: d.borrowedAmount.toString(),
        token_in: d.tokenIn.toString().toLowerCase(),
        amount_in: d.amountIn.toString(),
        block_date: d.timestamp,
        block_id: d.blockId,
        tx_hash: d.txHash,
      }
    })

    if (toInsert.length > 0) {
      await prisma.market_zap_leverage.createMany({
        data: toInsert,
      })
    }
  }
}
