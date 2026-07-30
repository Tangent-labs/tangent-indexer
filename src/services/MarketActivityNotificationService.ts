import { formatEther } from "ethers"
import { TelegramNotifierService } from "./TelegramNotificationServices.js"
import { SortedEvents } from "./events/UserMarketService.js"

type MarketActivityEvent = {
  market_id: bigint | number
  account: string
  tx_hash: string
}

const ETHERSCAN_BASE_URL = "https://etherscan.io"

function formatAmount(value: bigint | number | string): string {
  const numeric = Number(formatEther(value))
  return numeric.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatAccountLink(account: string, escape: (text: string) => string): string {
  return `[${escape(account)}](${ETHERSCAN_BASE_URL}/address/${account})`
}

function formatTxLink(txHash: string, escape: (text: string) => string): string {
  return `[${escape(shortenAddress(txHash))}](${ETHERSCAN_BASE_URL}/tx/${txHash})`
}

export class MarketActivityNotificationService {
  private readonly telegramNotifierService: TelegramNotifierService

  constructor(telegramNotifierService: TelegramNotifierService) {
    this.telegramNotifierService = telegramNotifierService
  }

  async sendNotifications(events: SortedEvents, marketNamesById: Map<number, string>): Promise<void> {
    for (const event of events.Deposit) {
      await this.sendEvent("Deposit", event, [`Staked amount: ${formatAmount(event.staked_amount)}`], marketNamesById)
    }
    for (const event of events.ZapDeposit) {
      await this.sendEvent("ZapDeposit", event, [`Staked amount: ${formatAmount(event.staked_amount)}`], marketNamesById)
    }
    for (const event of events.DepositAndBorrow) {
      await this.sendEvent(
        "DepositAndBorrow",
        event,
        [`Staked amount: ${formatAmount(event.staked_amount)}`, `Borrow amount: ${formatAmount(event.borrow_amount)}`],
        marketNamesById
      )
    }
    for (const event of events.ZapDepositAndBorrow) {
      await this.sendEvent(
        "ZapDepositAndBorrow",
        event,
        [`Staked amount: ${formatAmount(event.staked_amount)}`, `Borrow amount: ${formatAmount(event.borrow_amount)}`],
        marketNamesById
      )
    }
    for (const event of events.Withdraw) {
      await this.sendEvent("Withdraw", event, [`Withdrawn amount: ${formatAmount(event.withdrawn_amount)}`], marketNamesById)
    }
    for (const event of events.Repay) {
      await this.sendEvent("Repay", event, [`Repaid amount: ${formatAmount(event.repaid_amount)}`], marketNamesById)
    }
    for (const event of events.ZapRepay) {
      await this.sendEvent("ZapRepay", event, [`Repaid amount: ${formatAmount(event.repaid_amount)}`], marketNamesById)
    }
    for (const event of events.RepayAndWithdraw) {
      await this.sendEvent(
        "RepayAndWithdraw",
        event,
        [`Repaid amount: ${formatAmount(event.repaid_amount)}`, `Withdrawn amount: ${formatAmount(event.withdrawn_amount)}`],
        marketNamesById
      )
    }
    for (const event of events.ZapRepayAndWithdraw) {
      await this.sendEvent(
        "ZapRepayAndWithdraw",
        event,
        [`Repaid amount: ${formatAmount(event.repaid_amount)}`, `Withdrawn amount: ${formatAmount(event.withdrawn_amount)}`],
        marketNamesById
      )
    }

    for (const event of events.Leverage) {
      await this.sendEvent(
        "Leverage",
        event,
        [
          `Leverage amount: ${formatAmount(event.staked_amount)}`,
          `Bought amount : ${formatAmount(event.collat_bought)}`,
          `Borrow amount : ${formatAmount(event.borrowed_amount)}`,
        ],
        marketNamesById
      )
    }

    for (const event of events.ZapLeverage) {
      await this.sendEvent(
        "ZapLeverage",
        event,
        [
          `Leverage amount: ${formatAmount(event.staked_amount)}`,
          `Bought amount : ${formatAmount(event.collat_leverage)}`,
          `Borrow amount : ${formatAmount(event.borrowed_amount)}`,
        ],
        marketNamesById
      )
    }

    for (const event of events.SelfLiquidate) {
      await this.sendEvent(
        "SelfLiquidate",
        event,
        [`Collat amount: ${formatAmount(event.collateral_liquidated)}`, `Repaid amount : ${formatAmount(event.repaid_amount)}`],
        marketNamesById
      )
    }
  }

  private async sendEvent(eventName: string, event: MarketActivityEvent, amountLines: string[], marketNamesById: Map<number, string>): Promise<void> {
    const marketId = Number(event.market_id)
    const marketName = marketNamesById.get(marketId) ?? `Market #${marketId}`
    const escape = (text: string) => this.telegramNotifierService.escapeMarkdownV2(text)
    const message = [
      escape(`Event: ${eventName}`),
      escape(`Market: ${marketName} (#${marketId})`),
      `Account: ${formatAccountLink(event.account, escape)}`,
      ...amountLines.map(escape),
      `Transaction: ${formatTxLink(event.tx_hash, escape)}`,
    ].join("\n")

    await this.telegramNotifierService.sendMessage(message, true)
  }
}
