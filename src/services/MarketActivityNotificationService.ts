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
  lp_address: string
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

  /**
   * @notice  Liquidity is valued with the LP price (LP minted on add, LP burned on remove) and swaps
   *          with the USG side, so only USG, sUSG and the LP tokens need a price source.
   */
  async sendLpActivityNotifications(events: LpActivityEvents, usgLps: UsgLpKey[], usgAddress: string, susgAddress: string, prices: TokenPrices): Promise<void> {
    const lpsById = new Map(usgLps.map((lp) => [Number(lp.id), lp]))
    const usg = usgAddress.toLowerCase()
    const susg = susgAddress.toLowerCase()
    const zero = ZeroAddress.toLowerCase()

    // Coin `index` of the LP as a display label; the USD value is set only for USG, the one coin always priced
    const coin = (lp: UsgLpKey, index: number, amount: string | bigint) => {
      const token = (index === 0 ? lp.token_0 : lp.token_1)?.toLowerCase()
      const decimals = index === 0 ? lp.token_0_decimals : lp.token_1_decimals
      if (!token || decimals == null) return undefined
      const quantity = Number(formatUnits(amount, decimals))
      const usgPrice = token === usg ? prices.get(usg)?.price : undefined
      const symbol = prices.get(token)?.name ?? shortenAddress(token)
      return { label: `${formatNumber(quantity)} ${symbol}`, usd: usgPrice === undefined ? undefined : quantity * usgPrice }
    }
    const findLp = (lpId: bigint | number) => {
      const lp = lpsById.get(Number(lpId))
      if (!lp?.token_0 || !lp.token_1 || lp.token_0_decimals == null || lp.token_1_decimals == null) {
        console.warn(`LP activity alert skipped: LP #${lpId} has no coins/decimals in usg_lp_keys (run backfill_usg_lp_coins)`)
        return undefined
      }
      return lp
    }

    for (const swap of events.tokenExchange) {
      const lp = findLp(swap.usg_lp_id)
      if (!lp) continue
      const sold = coin(lp, swap.sold_id, swap.tokens_sold)!
      const bought = coin(lp, swap.bought_id, swap.tokens_bought)!
      const usd = sold.usd ?? bought.usd
      if (usd === undefined) {
        console.warn(`Swap alert skipped: no USG price or no USG coin in ${lp.lp_name}`)
        continue
      }
      if (usd < this.thresholds.swap) continue
      await this.sendActivity("Swap", lp.lp_name, swap.buyer, swap.tx_hash, [`Sold: ${sold.label}`, `Bought: ${bought.label}`], usd)
    }

    const liquidityEvents = [
      ...events.addLiquidity.map((event) => ({ name: "AddLiquidity", event, lpAmount: event.lp_amount })),
      // The remove events do not carry the LP burned, it is the LP transfer to zero from the provider in the same tx
      ...events.removeLiquidity.map((event) => {
        const lpAddress = lpsById.get(Number(event.usg_lp_id))?.lp_address.toLowerCase()
        const burn = events.transfers.find(
          (transfer) =>
            transfer.tx_hash === event.tx_hash &&
            transfer.token_address.toLowerCase() === lpAddress &&
            transfer.to.toLowerCase() === zero &&
            transfer.from.toLowerCase() === event.provider.toLowerCase()
        )
        return { name: "RemoveLiquidity", event, lpAmount: burn?.amount }
      }),
    ]
    for (const { name, event, lpAmount } of liquidityEvents) {
      const lp = findLp(event.usg_lp_id)
      if (!lp) continue
      const lpPrice = prices.get(lp.lp_address.toLowerCase())?.price
      if (lpPrice === undefined || lpAmount === undefined) {
        console.warn(`${name} alert skipped: no LP price or LP amount for ${lp.lp_name} (tx ${event.tx_hash})`)
        continue
      }
      // Curve LP tokens are 18 decimals
      const usd = Number(formatEther(lpAmount)) * lpPrice
      if (usd < this.thresholds.liquidity) continue
      const token0 = coin(lp, 0, event.token0_amount)!
      const token1 = coin(lp, 1, event.token1_amount)!
      await this.sendActivity(name, lp.lp_name, event.provider, event.tx_hash, [token0.label, token1.label], usd)
    }

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
