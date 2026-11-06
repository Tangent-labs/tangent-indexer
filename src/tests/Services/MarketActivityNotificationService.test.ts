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
    const usg = "0xUSG"
    const susg = "0xSUSG"
    // USDC has no price source on purpose: only USG, sUSG and the LP token are priced
    const usgLps = [{ id: 1n, lp_name: "USG-USDC", lp_address: "0xLP", token_0: "0xUSDC", token_0_decimals: 6, token_1: "0xUSG", token_1_decimals: 18 }]
    const prices = new Map([
      ["0xusg", { price: 0.99, name: "USG" }],
      ["0xsusg", { price: 1.05, name: "sUSG" }],
      ["0xlp", { price: 2, name: "USG_USDC" }],
    ])
    const base = { block_date: new Date(), block_id: 1, tx_hash: "0xtx" }
    const empty = () => ({ addLiquidity: [], removeLiquidity: [], tokenExchange: [], transfers: [] }) as any
    const transfer = (token: string, from: string, to: string, amount: string) => ({
      ...base,
      token_address: token,
      from,
      to,
      amount: parseEther(amount).toString(),
    })

    it("values swaps with the USG side, whichever side it is, above the threshold only", async () => {
      const events = empty()
      const swap = (soldId: number, soldAmount: string, boughtAmount: string) => ({
        ...base,
        usg_lp_id: 1n,
        buyer: "0xbuyer",
        sold_id: soldId,
        tokens_sold: soldAmount,
        bought_id: 1 - soldId,
        tokens_bought: boughtAmount,
      })
      // Sells 2000 USDC for 2000 USG ($1,980), then sells 2000 USG ($1,980), then a $990 swap
      events.tokenExchange.push(
        swap(0, "2000000000", parseEther("2000").toString()),
        swap(1, parseEther("2000").toString(), "2000000000"),
        swap(1, parseEther("1000").toString(), "1000000000")
      )

      await lpService.sendLpActivityNotifications(events, usgLps, usg, susg, prices)

      expect(sendMessage).toHaveBeenCalledTimes(2)
      expect(sendMessage.mock.calls[0][0]).toContain("Value: $1,980")
      expect(sendMessage.mock.calls[0][0]).toContain("Sold: 2,000 0xusdc")
      expect(sendMessage.mock.calls[1][0]).toContain("Sold: 2,000 USG")
    })

    it("values add liquidity with the LP minted", async () => {
      const events = empty()
      events.addLiquidity.push({
        ...base,
        usg_lp_id: 1n,
        provider: "0xprovider",
        lp_amount: parseEther("600").toString(),
        token0_amount: "1000000",
        token1_amount: "0",
      })

      await lpService.sendLpActivityNotifications(events, usgLps, usg, susg, prices)

      expect(sendMessage).toHaveBeenCalledTimes(1)
      expect(sendMessage.mock.calls[0][0]).toContain("Event: AddLiquidity")
      expect(sendMessage.mock.calls[0][0]).toContain("Value: $1,200")
    })

    it("values remove liquidity with the LP burned by the provider in the same tx", async () => {
      const events = empty()
      events.removeLiquidity.push({ ...base, usg_lp_id: 1n, provider: "0xProvider", token0_amount: "0", token1_amount: "0" })
      events.transfers.push(transfer("0xlp", "0xprovider", ZeroAddress, "700"), transfer("0xlp", "0xsomeoneelse", ZeroAddress, "9999"))

      await lpService.sendLpActivityNotifications(events, usgLps, usg, susg, prices)

      expect(sendMessage).toHaveBeenCalledTimes(1)
      expect(sendMessage.mock.calls[0][0]).toContain("Event: RemoveLiquidity")
      expect(sendMessage.mock.calls[0][0]).toContain("Value: $1,400")
    })

    it("alerts on sUSG mints and burns but ignores other tokens", async () => {
      const events = empty()
      events.transfers.push(
        transfer("0xsusg", ZeroAddress, "0xuser", "2000"),
        transfer("0xSUSG", "0xuser", ZeroAddress, "2000"),
        transfer("0xother", ZeroAddress, "0xuser", "2000")
      )

      await lpService.sendLpActivityNotifications(events, usgLps, usg, susg, prices)

      expect(sendMessage).toHaveBeenCalledTimes(2)
      expect(sendMessage.mock.calls[0][0]).toContain("Event: sUSG Mint")
      expect(sendMessage.mock.calls[1][0]).toContain("Event: sUSG Burn")
    })

    it("skips liquidity events when the LP has no price", async () => {
      const events = empty()
      events.addLiquidity.push({
        ...base,
        usg_lp_id: 1n,
        provider: "0xprovider",
        lp_amount: parseEther("5000").toString(),
        token0_amount: "0",
        token1_amount: "0",
      })

      await lpService.sendLpActivityNotifications(events, usgLps, usg, susg, new Map([["0xusg", { price: 1, name: "USG" }]]))

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
