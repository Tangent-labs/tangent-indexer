import { AbstractRepository } from "./AbstractRepository"
import { AddressLike } from "ethers"

export class MarketLiquidateRepository extends AbstractRepository {
  async insertLiquidations(
    data: {
      market: AddressLike
      account: AddressLike
      repaidAmount: string
      fee: string
      collateralLiquidated: string
      liquidator: AddressLike
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
        repaid_amount: d.repaidAmount,
        fee: d.fee,
        collateral_liquidated: d.collateralLiquidated,
        block_date: d.timestamp,
        liquidator: d.liquidator.toString().toLowerCase(),
        block_id: d.blockId,
        tx_hash: d.txHash,
      }
    })

    if (toInsert.length > 0) {
      await prisma.market_liquidate.createMany({
        data: toInsert,
      })
    }
  }

  async insertSelfLiquidations(
    data: {
      market: AddressLike
      account: AddressLike
      repaidAmount: string
      collateralLiquidated: string
      liquidator: AddressLike
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
        repaid_amount: d.repaidAmount,
        collateral_liquidated: d.collateralLiquidated,
        block_date: d.timestamp,
        liquidator: d.liquidator.toString().toLowerCase(),
        block_id: d.blockId,
        tx_hash: d.txHash,
      }
    })

    if (toInsert.length > 0) {
      await prisma.market_self_liquidate.createMany({
        data: toInsert,
      })
    }
  }
}
