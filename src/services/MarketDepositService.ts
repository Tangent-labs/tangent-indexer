import { JsonRpcProvider, AddressLike } from "ethers"
import { MarketContractsRepository } from "../db/MarketContractsRepository"
import { EventDetectionService } from "../type/service"
import { MarketDepositRepository } from "../db/MarketDepositRepository"
import { fetchMarketDepositLogs } from "eventFectcher/marketDepositEventFetcher"

export class MarketDepositService implements EventDetectionService {
  marketDepositRepository: MarketDepositRepository
  marketContractsRepository: MarketContractsRepository

  constructor(MarketDepositRepository: MarketDepositRepository, marketContractsRepository: MarketContractsRepository) {
    this.marketDepositRepository = MarketDepositRepository
    this.marketContractsRepository = marketContractsRepository
  }

  async runDetection(provider: JsonRpcProvider, startingBlock: number, endingBlock: number) {
    try {
      const marketContracts: AddressLike[] = (await this.marketContractsRepository.getContracts()).map((contract) => contract.contract_address as AddressLike)

      const { depositLogs, zapDepositLogs, depositAndBorrowLogs, zapDepositAndBorrowLogs, borrowLogs } = await fetchMarketDepositLogs(
        provider,
        startingBlock,
        endingBlock,
        marketContracts
      )

      await this.marketDepositRepository.insertBorrows(
        borrowLogs.map((log) => ({
          account: log.account,
          receiver: log.receiver,
          borrowedAmount: log.borrowedAmount,
          timestamp: log.timestamp,
        }))
      )

      await this.marketDepositRepository.insertZapDeposits(
        zapDepositLogs.map((log) => ({
          depositer: log.depositer,
          market: log.market,
          stakedAmount: log.stakedAmount,
          tokenIn: log.tokenIn,
          amountIn: log.amountIn,
          timestamp: log.timestamp,
        }))
      )

      await this.marketDepositRepository.insertDeposits(
        depositLogs.map((log) => ({
          depositer: log.depositer,
          market: log.market,
          stakedAmount: log.stakedAmount,
          timestamp: log.timestamp,
        }))
      )

      await this.marketDepositRepository.insertDepositAndBorrow(
        depositAndBorrowLogs.map((log) => ({
          depositer: log.depositer,
          market: log.market,
          stakedAmount: log.stakedAmount,
          borrowAmount: log.borrowAmount,
          timestamp: log.timestamp,
        }))
      )

      await this.marketDepositRepository.insertZapDepositAndBorrow(
        zapDepositAndBorrowLogs.map((log) => ({
          depositer: log.depositer,
          market: log.market,
          stakedAmount: log.stakedAmount,
          borrowAmount: log.borrowAmount,
          tokenIn: log.tokenIn,
          amountIn: log.amountIn,
          timestamp: log.timestamp,
        }))
      )
    } catch (error) {
      throw new Error(`Failed to detect deposit actions: ${(error as Error).message}`)
    }
  }
}
