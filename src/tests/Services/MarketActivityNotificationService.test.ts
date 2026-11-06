import { beforeEach, describe, expect, it, vi } from "vitest"

import { MarketActivityNotificationService } from "../../services/MarketActivityNotificationService.js"
import { TelegramNotifierService } from "../../services/TelegramNotificationServices.js"
import { SortedEvents } from "../../services/events/UserMarketService.js"
import { parseEther, ZeroAddress } from "ethers"

describe("MarketActivityNotificationService", () => {
  const telegramNotifierService = new TelegramNotifierService({ botToken: "token", chatId: "chat" })
  const sendMessage = vi.spyOn(telegramNotifierService, "sendMessage").mockResolvedValue(true)
  const service = new MarketActivityNotificationService(telegramNotifierService)

  beforeEach(() => {
    sendMessage.mockClear()
  })

  const notifications = [
    { eventName: "Deposit", amounts: ["Staked amount: 10"], event: { staked_amount: parseEther("10") } },
    { eventName: "ZapDeposit", amounts: ["Staked amount: 11"], event: { staked_amount: parseEther("11") } },
    {
      eventName: "DepositAndBorrow",
      amounts: ["Staked amount: 12", "Borrow amount: 22"],
      event: { staked_amount: parseEther("12"), borrow_amount: parseEther("22") },
    },
    {
      eventName: "ZapDepositAndBorrow",
      amounts: ["Staked amount: 13", "Borrow amount: 23"],
      event: { staked_amount: parseEther("13"), borrow_amount: parseEther("23") },
    },
    { eventName: "Withdraw", amounts: ["Withdrawn amount: 14"], event: { withdrawn_amount: parseEther("14") } },
    { eventName: "Repay", amounts: ["Repaid amount: 15"], event: { repaid_amount: parseEther("15") } },
    { eventName: "ZapRepay", amounts: ["Repaid amount: 16"], event: { repaid_amount: parseEther("16") } },
    {
      eventName: "RepayAndWithdraw",
      amounts: ["Repaid amount: 17", "Withdrawn amount: 27"],
      event: { repaid_amount: parseEther("17"), withdrawn_amount: parseEther("27") },
    },
    {
      eventName: "ZapRepayAndWithdraw",
      amounts: ["Repaid amount: 18", "Withdrawn amount: 28"],
      event: { repaid_amount: parseEther("18"), withdrawn_amount: parseEther("28") },
    },
  ] as const

  it.each(notifications)("sends a $eventName notification with market name and action amounts", async ({ eventName, amounts, event }) => {
    const events = emptySortedEvents()
    ;(events[eventName] as any[]).push({
      ...event,
      market_id: 1n,
      account: "0x1234567890abcdef1234567890abcdef12345678",
      tx_hash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678",
    })

    await service.sendNotifications(events, new Map([[1, "Test Market"]]))

    expect(sendMessage).toHaveBeenCalledTimes(1)
    const [message, alreadyFormatted] = sendMessage.mock.calls[0]
    expect(alreadyFormatted).toBe(true)
    expect(message).toContain(`Event: ${eventName}`)
    expect(message).toContain("Market: Test Market \\(\\#1\\)")
    expect(message).toContain("Account: [0x1234567890abcdef1234567890abcdef12345678](https://etherscan.io/address/0x1234567890abcdef1234567890abcdef12345678)")
    expect(message).toContain("Transaction: [0xabcd\\.\\.\\.5678](https://etherscan.io/tx/0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678)")
    amounts.forEach((amount) => expect(message).toContain(amount.replace(/\./g, "\\.")))
  })

  it("formats large amounts with thousands separators and at most 2 decimals", async () => {
    const events = emptySortedEvents()
    events.Deposit.push({
      market_id: 1n,
      account: "0xaccount",
      staked_amount: parseEther("1432000.23").toString(),
      tx_hash: "0xtx",
      block_date: new Date(),
      block_id: 1,
    })

    await service.sendNotifications(events, new Map([[1, "Test Market"]]))

    const message = sendMessage.mock.calls[0][0]
    expect(message).toContain("Staked amount: 1,432,000\\.23")
  })

  it("uses a market id fallback when a market name is unavailable", async () => {
    const events = emptySortedEvents()
    events.Deposit.push({
      market_id: 42n,
      account: "0xaccount",
      staked_amount: "10",
      block_date: new Date(),
      block_id: 1,
      tx_hash: "0xtx",
    })

    await service.sendNotifications(events, new Map())

    expect(sendMessage.mock.calls[0][0]).toContain("Market: Market \\#42 \\(\\#42\\)")
  })

  it("does not send notifications for event groups outside market activity scope", async () => {
    const events = emptySortedEvents()
    events.Borrow.push({
      market_id: 1n,
      account: "0xaccount",
      receiver: "0xreceiver",
      borrowed_amount: "10",
      debt_shares: "1",
      block_date: new Date(),
      block_id: 1,
      tx_hash: "0xtx",
    })

    await service.sendNotifications(events, new Map([[1, "Test Market"]]))

    expect(sendMessage).not.toHaveBeenCalled()
  })

  describe("sendLpActivityNotifications", () => {
    const lpService = new MarketActivityNotificationService(telegramNotifierService, { swap: 1_000, liquidity: 1_000, susg: 1_000 })
    const susg = "0xSUSG"
    const usgLps = [{ id: 1n, lp_name: "USG-sUSDC", token_0: "0xUSG", token_0_decimals: 18, token_1: "0xSUSDC", token_1_decimals: 6 }]
    const prices = new Map([
      ["0xusg", { price: 1, name: "USG" }],
      ["0xsusdc", { price: 1.1, name: "sUSDC" }],
      ["0xsusg", { price: 1.05, name: "sUSG" }],
    ])
    const base = { block_date: new Date(), block_id: 1, tx_hash: "0xtx" }
    const empty = () => ({ addLiquidity: [], removeLiquidity: [], tokenExchange: [], transfers: [] }) as any

    it("alerts on swaps above the USD threshold only", async () => {
      const events = empty()
      const swap = (sold: string) => ({
        ...base,
        usg_lp_id: 1n,
        buyer: "0xbuyer",
        sold_id: 0,
        tokens_sold: parseEther(sold).toString(),
        bought_id: 1,
        tokens_bought: "1",
      })
      events.tokenExchange.push(swap("2000"), swap("999"))

      await lpService.sendLpActivityNotifications(events, usgLps, susg, prices)

      expect(sendMessage).toHaveBeenCalledTimes(1)
      expect(sendMessage.mock.calls[0][0]).toContain("Event: Swap")
      expect(sendMessage.mock.calls[0][0]).toContain("Value: $2,000")
    })

    it("values a 6 decimals coin with its real price on add liquidity", async () => {
      const events = empty()
      // 500 USG + 500 sUSDC @ 1.1 = $1,050
      events.addLiquidity.push({
        ...base,
        usg_lp_id: 1n,
        provider: "0xprovider",
        lp_amount: "1",
        token0_amount: parseEther("500").toString(),
        token1_amount: "500000000",
      })

      await lpService.sendLpActivityNotifications(events, usgLps, susg, prices)

      expect(sendMessage).toHaveBeenCalledTimes(1)
      expect(sendMessage.mock.calls[0][0]).toContain("Value: $1,050")
      expect(sendMessage.mock.calls[0][0]).toContain("500 sUSDC")
    })

    it("alerts on sUSG mints and burns but ignores other tokens", async () => {
      const events = empty()
      const transfer = (token: string, from: string, to: string) => ({ ...base, token_address: token, from, to, amount: parseEther("2000").toString() })
      events.transfers.push(transfer("0xsusg", ZeroAddress, "0xuser"), transfer("0xSUSG", "0xuser", ZeroAddress), transfer("0xother", ZeroAddress, "0xuser"))

      await lpService.sendLpActivityNotifications(events, usgLps, susg, prices)

      expect(sendMessage).toHaveBeenCalledTimes(2)
      expect(sendMessage.mock.calls[0][0]).toContain("Event: sUSG Mint")
      expect(sendMessage.mock.calls[1][0]).toContain("Event: sUSG Burn")
    })

    it("skips events whose token has no price", async () => {
      const events = empty()
      events.removeLiquidity.push({ ...base, usg_lp_id: 1n, provider: "0xprovider", token0_amount: parseEther("5000").toString(), token1_amount: "0" })

      await lpService.sendLpActivityNotifications(events, usgLps, susg, new Map([["0xusg", { price: 1, name: "USG" }]]))

      expect(sendMessage).not.toHaveBeenCalled()
    })
  })
})

function emptySortedEvents(): SortedEvents {
  return {
    Deposit: [],
    ZapDeposit: [],
    DepositAndBorrow: [],
    ZapDepositAndBorrow: [],
    Repay: [],
    ZapRepay: [],
    RepayAndWithdraw: [],
    ZapRepayAndWithdraw: [],
    Withdraw: [],
    Borrow: [],
    Leverage: [],
    ZapLeverage: [],
    Liquidate: [],
    SelfLiquidate: [],
    SeizeCollateral: [],
    MigrateFrom: [],
    MigrateTo: [],
  }
}
