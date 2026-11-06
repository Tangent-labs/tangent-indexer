import { Prisma } from "@prisma/client"
import { formatEther, formatUnits, ZeroAddress } from "ethers"
import { TelegramNotifierService } from "./TelegramNotificationServices.js"
import { SortedEvents } from "./events/UserMarketService.js"

export type LpActivityThresholds = { swap: number; liquidity: number; susg: number }

export type LpActivityEvents = {
  addLiquidity: Prisma.add_liquidity_eventsCreateManyInput[]
  removeLiquidity: Prisma.remove_liquidityCreateManyInput[]
  tokenExchange: Prisma.token_exchangeCreateManyInput[]
  transfers: Prisma.transfer_eventsCreateManyInput[]
}

export type UsgLpKey = {
  id: bigint | number
  lp_name: string
  token_0: string | null
  token_0_decimals: number | null
  token_1: string | null
  token_1_decimals: number | null
}

export type TokenPrices = Map<string, { price: number; name: string }>

type MarketActivityEvent = {
  market_id: bigint | number
  account: string
  tx_hash: string
}

const ETHERSCAN_BASE_URL = "https://etherscan.io"

function formatNumber(numeric: number): string {
  return numeric.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function formatAmount(value: bigint | number | string): string {
  return formatNumber(Number(formatEther(value)))
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
  private readonly thresholds: LpActivityThresholds

  constructor(telegramNotifierService: TelegramNotifierService, thresholds: LpActivityThresholds = { swap: 1_000, liquidity: 1_000, susg: 1_000 }) {
    this.telegramNotifierService = telegramNotifierService
    this.thresholds = thresholds
  }

  async sendLpActivityNotifications(events: LpActivityEvents, usgLps: UsgLpKey[], susgAddress: string, prices: TokenPrices): Promise<void> {
    const lpsById = new Map(usgLps.map((lp) => [Number(lp.id), lp]))
    // Coin `index` of the LP, valued with its last price; undefined when the LP or price is unknown
    const coin = (lpId: bigint | number, index: number, amount: string | bigint) => {
      const lp = lpsById.get(Number(lpId))
      const token = (index === 0 ? lp?.token_0 : lp?.token_1)?.toLowerCase()
      const decimals = index === 0 ? lp?.token_0_decimals : lp?.token_1_decimals
      const price = token ? prices.get(token) : undefined
      if (!lp || !price || decimals == null) {
        console.warn(`LP activity alert skipped: no price/decimals for coin ${index} of LP #${lpId}`)
        return undefined
      }
      const quantity = Number(formatUnits(amount, decimals))
      return { lpName: lp.lp_name, label: `${formatNumber(quantity)} ${price.name}`, usd: quantity * price.price }
    }

    for (const swap of events.tokenExchange) {
      const sold = coin(swap.usg_lp_id, swap.sold_id, swap.tokens_sold)
      const bought = coin(swap.usg_lp_id, swap.bought_id, swap.tokens_bought)
      if (!sold || !bought || sold.usd < this.thresholds.swap) continue
      await this.sendActivity("Swap", sold.lpName, swap.buyer, swap.tx_hash, [`Sold: ${sold.label}`, `Bought: ${bought.label}`], sold.usd)
    }

    const liquidityEvents = [
      ...events.addLiquidity.map((event) => ({ name: "AddLiquidity", event })),
      ...events.removeLiquidity.map((event) => ({ name: "RemoveLiquidity", event })),
    ]
    for (const { name, event } of liquidityEvents) {
      const token0 = coin(event.usg_lp_id, 0, event.token0_amount)
      const token1 = coin(event.usg_lp_id, 1, event.token1_amount)
      if (!token0 || !token1) continue
      const usd = token0.usd + token1.usd
      if (usd < this.thresholds.liquidity) continue
      await this.sendActivity(name, token0.lpName, event.provider, event.tx_hash, [token0.label, token1.label], usd)
    }

    const susg = susgAddress.toLowerCase()
    const zero = ZeroAddress.toLowerCase()
    for (const transfer of events.transfers) {
      if (transfer.token_address.toLowerCase() !== susg) continue
      const isMint = transfer.from.toLowerCase() === zero
      if (!isMint && transfer.to.toLowerCase() !== zero) continue
      const price = prices.get(susg)
      if (!price) {
        console.warn("sUSG alert skipped: no sUSG price")
        continue
      }
      const quantity = Number(formatEther(transfer.amount))
      const usd = quantity * price.price
      if (usd < this.thresholds.susg) continue
      const account = isMint ? transfer.to : transfer.from
      await this.sendActivity(isMint ? "sUSG Mint" : "sUSG Burn", undefined, account, transfer.tx_hash, [`Amount: ${formatNumber(quantity)} sUSG`], usd)
    }
  }

  private async sendActivity(eventName: string, lpName: string | undefined, account: string, txHash: string, lines: string[], usd: number) {
    const escape = (text: string) => this.telegramNotifierService.escapeMarkdownV2(text)
    const message = [
      escape(`Event: ${eventName}`),
      ...(lpName ? [escape(`LP: ${lpName}`)] : []),
      `Account: ${formatAccountLink(account, escape)}`,
      ...lines.map(escape),
      escape(`Value: $${formatNumber(usd)}`),
      `Transaction: ${formatTxLink(txHash, escape)}`,
    ].join("\n")

    await this.telegramNotifierService.sendMessage(message, true)
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
