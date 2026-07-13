import { beforeEach, describe, expect, it, vi } from "vitest"

import { MarketActivityNotificationService } from "../../services/MarketActivityNotificationService.js"
import { SortedEvents } from "../../services/events/UserMarketService.js"
import { parseEther } from "ethers"

describe("MarketActivityNotificationService", () => {
  const sendMessage = vi.fn().mockResolvedValue(true)
  const service = new MarketActivityNotificationService({ sendMessage } as any)

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
      account: "0xaccount",
      tx_hash: "0xtx",
    })

    await service.sendNotifications(events, new Map([[1, "Test Market"]]))

    expect(sendMessage).toHaveBeenCalledTimes(1)
    const message = sendMessage.mock.calls[0][0]
    expect(message).toContain(`Event: ${eventName}`)
    expect(message).toContain("Market: Test Market (#1)")
    expect(message).toContain("Account: 0xaccount")
    expect(message).toContain("Transaction: 0xtx")
    amounts.forEach((amount) => expect(message).toContain(amount))
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

    expect(sendMessage.mock.calls[0][0]).toContain("Market: Market #42 (#42)")
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
