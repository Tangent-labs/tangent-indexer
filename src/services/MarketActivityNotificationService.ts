import { formatEther } from "ethers"
import { TelegramNotifierService } from "./TelegramNotificationServices.js"
import { SortedEvents } from "./events/UserMarketService.js"

type MarketActivityEvent = {
  market_id: bigint | number
  account: string
  tx_hash: string
}

export class MarketActivityNotificationService {
  private readonly telegramNotifierService: TelegramNotifierService

  constructor(telegramNotifierService: TelegramNotifierService) {
    this.telegramNotifierService = telegramNotifierService
  }

  async sendNotifications(events: SortedEvents, marketNamesById: Map<number, string>): Promise<void> {
    for (const event of events.Deposit) {
      await this.sendEvent("Deposit", event, [`Staked amount: ${formatEther(event.staked_amount)}`], marketNamesById)
    }
    for (const event of events.ZapDeposit) {
      await this.sendEvent("ZapDeposit", event, [`Staked amount: ${formatEther(event.staked_amount)}`], marketNamesById)
    }
    for (const event of events.DepositAndBorrow) {
      await this.sendEvent(
        "DepositAndBorrow",
        event,
        [`Staked amount: ${formatEther(event.staked_amount)}`, `Borrow amount: ${formatEther(event.borrow_amount)}`],
        marketNamesById
      )
    }
    for (const event of events.ZapDepositAndBorrow) {
      await this.sendEvent(
        "ZapDepositAndBorrow",
        event,
        [`Staked amount: ${formatEther(event.staked_amount)}`, `Borrow amount: ${formatEther(event.borrow_amount)}`],
        marketNamesById
      )
    }
    for (const event of events.Withdraw) {
      await this.sendEvent("Withdraw", event, [`Withdrawn amount: ${formatEther(event.withdrawn_amount)}`], marketNamesById)
    }
    for (const event of events.Repay) {
      await this.sendEvent("Repay", event, [`Repaid amount: ${formatEther(event.repaid_amount)}`], marketNamesById)
    }
    for (const event of events.ZapRepay) {
      await this.sendEvent("ZapRepay", event, [`Repaid amount: ${formatEther(event.repaid_amount)}`], marketNamesById)
    }
    for (const event of events.RepayAndWithdraw) {
      await this.sendEvent(
        "RepayAndWithdraw",
        event,
        [`Repaid amount: ${formatEther(event.repaid_amount)}`, `Withdrawn amount: ${formatEther(event.withdrawn_amount)}`],
        marketNamesById
      )
    }
    for (const event of events.ZapRepayAndWithdraw) {
      await this.sendEvent(
        "ZapRepayAndWithdraw",
        event,
        [`Repaid amount: ${formatEther(event.repaid_amount)}`, `Withdrawn amount: ${formatEther(event.withdrawn_amount)}`],
        marketNamesById
      )
    }

    for (const event of events.Leverage) {
      await this.sendEvent(
        "Leverage",
        event,
        [
          `Leverage amount: ${formatEther(event.staked_amount)}`,
          `Bought amount : ${formatEther(event.collat_bought)}`,
          `Borrow amount : ${formatEther(event.borrowed_amount)}`,
        ],
        marketNamesById
      )
    }

    for (const event of events.ZapLeverage) {
      await this.sendEvent(
        "ZapLeverage",
        event,
        [
          `Leverage amount: ${formatEther(event.staked_amount)}`,
          `Bought amount : ${formatEther(event.collat_leverage)}`,
          `Borrow amount : ${formatEther(event.borrowed_amount)}`,
        ],
        marketNamesById
      )
    }

    for (const event of events.SelfLiquidate) {
      await this.sendEvent(
        "SelfLiquidate",
        event,
        [`Collat amount: ${formatEther(event.collateral_liquidated)}`, `Repaid amount : ${formatEther(event.repaid_amount)}`],
        marketNamesById
      )
    }
  }

  private async sendEvent(eventName: string, event: MarketActivityEvent, amountLines: string[], marketNamesById: Map<number, string>): Promise<void> {
    const marketId = Number(event.market_id)
    const marketName = marketNamesById.get(marketId) ?? `Market #${marketId}`
    const message = [
      `Event: ${eventName}`,
      `Market: ${marketName} (#${marketId})`,
      `Account: ${event.account}`,
      ...amountLines,
      `Transaction: ${event.tx_hash}`,
    ].join("\n")

    await this.telegramNotifierService.sendMessage(message)
  }
}
