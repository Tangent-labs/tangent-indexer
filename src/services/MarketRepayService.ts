import { JsonRpcProvider, AddressLike } from "ethers"
import { MarketContractsRepository } from "../db/MarketContractsRepository"
import { EventDetectionService } from "../type/service"
import { MarketRepayRepository } from "db/MarketRepayRepository"
import { fetchMarketRepayLogs } from "eventFectcher/marketRepayEventFetcher"

export class MarketRepayService implements EventDetectionService {
  marketRepayRepository: MarketRepayRepository
  marketContractsRepository: MarketContractsRepository

  constructor(MarketRepayRepository: MarketRepayRepository, marketContractsRepository: MarketContractsRepository) {
    this.marketRepayRepository = MarketRepayRepository
    this.marketContractsRepository = marketContractsRepository
  }

  async runDetection(provider: JsonRpcProvider, startingBlock: number, endingBlock: number) {
    try {
      const marketContracts: AddressLike[] = (await this.marketContractsRepository.getContracts()).map((contract) => contract.contract_address as AddressLike)

      const { repayLogs, repayAndWithdrawLogs, zapRepayLogs, zapRepayAndWithdrawLogs, withdrawLogs } = await fetchMarketRepayLogs(
        provider,
        startingBlock,
        endingBlock,
        marketContracts
      )

      await this.marketRepayRepository.insertRepays(repayLogs)
      await this.marketRepayRepository.insertRepayAndWithdraw(repayAndWithdrawLogs)
      await this.marketRepayRepository.insertZapRepays(zapRepayLogs)
      await this.marketRepayRepository.insertZapRepayAndWithdraw(zapRepayAndWithdrawLogs)
      await this.marketRepayRepository.insertWithdraws(withdrawLogs)
    } catch (error) {
      throw new Error(`Failed to detect repay actions: ${(error as Error).message}`)
    }
  }
}
