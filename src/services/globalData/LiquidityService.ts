import { Prisma } from "@prisma/client"
import { LiquidityRepository } from "../../db/LiquidityRepository.js"

export class LiquidityService {
  liquidityRepository: LiquidityRepository

  constructor(liquidityRepository: LiquidityRepository) {
    this.liquidityRepository = liquidityRepository
  }

  async insertEvents(
    transferEvents: Prisma.transfer_eventsCreateManyInput[],
    addLiquidityEvents: Prisma.add_liquidity_eventsCreateManyInput[],
    removeLiquidityEvents: Prisma.remove_liquidityCreateManyInput[],
    tokenExchangeEvents: Prisma.token_exchangeCreateManyInput[]
  ) {
    await this.liquidityRepository.insertTransfers(transferEvents)
    await this.liquidityRepository.insertAddLiquidity(addLiquidityEvents)
    await this.liquidityRepository.insertRemoveLiquidity(removeLiquidityEvents)
    await this.liquidityRepository.insertTokenExchange(tokenExchangeEvents)
  }
}
