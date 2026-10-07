import { Prisma } from "@prisma/client"
import { BlockTag, Contract, formatEther, Provider } from "ethers"
import { LiquidityRepository } from "../../db/LiquidityRepository.js"

const ERC20_TOTAL_SUPPLY_ABI = ["function totalSupply() view returns (uint256)"]

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

  /**
   * @notice  $ liquidity of every USG pool at a given block: LP total supply valued with the LP
   *          price feed. The live run reads the latest block, the backfill passes a past one.
   */
  async buildLpLiquidityRows(provider: Provider, date: Date, blockTag?: BlockTag): Promise<Prisma.usg_lp_historyCreateManyInput[]> {
    const lps = await this.liquidityRepository.getUsgLps()

    const rows = await Promise.all(
      lps.map(async (lp) => {
        // A pool has no code before its deployment block, which only happens on the backfill
        if ((await provider.getCode(lp.lp_address, blockTag)) === "0x") return undefined

        const lpPrice = await this.liquidityRepository.getLpPriceAt(lp.lp_address, date)
        if (lpPrice === undefined) {
          console.warn(`No LP price for ${lp.lp_name} at ${date.toISOString()}, its liquidity is skipped`)
          return undefined
        }

        const totalSupply = Number(formatEther(await new Contract(lp.lp_address, ERC20_TOTAL_SUPPLY_ABI, provider).totalSupply({ blockTag })))
        return { usg_lp_id: lp.id, date, liquidity_usd: totalSupply * lpPrice }
      })
    )

    return rows.filter((row) => row !== undefined)
  }
}
