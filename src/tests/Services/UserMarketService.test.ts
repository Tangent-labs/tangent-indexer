import { describe, expect, it, vi } from "vitest"

import { AbiCoder, AddressLike, id, JsonRpcProvider, Log, parseEther } from "ethers"
import { UserMarketService } from "../../services/events/UserMarketService"
import {
  BORROW,
  DEPOSIT,
  DEPOSIT_AND_BORROW,
  REPAY,
  REPAY_AND_WITHDRAW,
  WITHDRAW,
  ZAP_DEPOSIT,
  ZAP_DEPOSIT_AND_BORROW,
  ZAP_REPAY,
  ZAP_REPAY_AND_WITHDRAW,
  LEVERAGE,
  ZAP_LEVERAGE,
  LIQUIDATE,
  SELF_LIQUIDATE,
  SEIZE_COLLATERAL,
  encodeBorrow,
  encodeDeposit,
  encodeDepositAndBorrow,
  encodeRepay,
  encodeRepayAndWithdraw,
  encodeWithdraw,
  encodeZapDeposit,
  encodeZapDepositAndBorrow,
  encodeZapRepay,
  encodeZapRepayAndWithdraw,
  encodeLeverage,
  encodeZapLeverage,
  encodeLiquidate,
  encodeSelfLiquidate,
  encodeSeizeCollateral,
} from "../../resources/eventSignatures"
import { ActiveBorrowersService } from "../../services/ActiveBorrowersService"
import { ActiveBorrowersRepository } from "../../db/ActiveBorrowersRepository"
import { UserEventsRepository } from "db/UserEventsRepository"

function buildLog(topicId: string, address: string, user: AddressLike, blockNumber: number, data: string) {
  const userEncoded = AbiCoder.defaultAbiCoder().encode(["address"], [user])

  return new Log(
    {
      topics: [topicId, userEncoded],
      address,
      blockHash: "12",
      blockNumber,
      data,
      index: 1,
      removed: false,
      transactionHash: "0x",
      transactionIndex: 2,
    },
    new JsonRpcProvider()
  )
}

describe("UserMarketService", () => {
  it("Decode and sort properly - all switch cases", async () => {
    const activeBorrowesRepository = {
      insertActiveBorrowers: vi.fn(),
      deleteActiveBorrowers: vi.fn(),
    } as any as ActiveBorrowersRepository

    const userEventsRepository = {} as any as UserEventsRepository

    const activeBorrowersService = new ActiveBorrowersService(activeBorrowesRepository)

    const user0 = "0x0000000000000000000000000000000000000001"
    const user1 = "0x0000000000000000000000000000000000000002"
    const user2 = "0x0000000000000000000000000000000000000003"
    const user3 = "0x0000000000000000000000000000000000000004"
    const user4 = "0x0000000000000000000000000000000000000005"
    const user5 = "0x0000000000000000000000000000000000000006"
    const user6 = "0x0000000000000000000000000000000000000007"
    const user7 = "0x0000000000000000000000000000000000000008"
    const user8 = "0x0000000000000000000000000000000000000009"
    const user9 = "0x000000000000000000000000000000000000000a"
    const user10 = "0x000000000000000000000000000000000000000b"
    const user11 = "0x000000000000000000000000000000000000000c"
    const user12 = "0x000000000000000000000000000000000000000d"
    const user13 = "0x000000000000000000000000000000000000000e"
    const user14 = "0x000000000000000000000000000000000000000f"

    const userMarketService = new UserMarketService(userEventsRepository)

    // Create logs for all 15 event types
    const repayLog = buildLog(id(REPAY), "0x1", user0, 100, encodeRepay(user0, parseEther("1000"), parseEther("500")))
    const repayAndWithdrawLog = buildLog(
      id(REPAY_AND_WITHDRAW),
      "0x1",
      user1,
      101,
      encodeRepayAndWithdraw(parseEther("2000"), parseEther("1000"), parseEther("800"))
    )
    const zapRepayLog = buildLog(
      id(ZAP_REPAY),
      "0x1",
      user2,
      102,
      encodeZapRepay(user2, parseEther("1500"), parseEther("600"), "0x1234567890123456789012345678901234567890", parseEther("3000"))
    )
    const zapRepayAndWithdrawLog = buildLog(
      id(ZAP_REPAY_AND_WITHDRAW),
      "0x1",
      user3,
      103,
      encodeZapRepayAndWithdraw(parseEther("2500"), parseEther("1200"), parseEther("900"), "0x2345678901234567890123456789012345678901", parseEther("4000"))
    )
    const withdrawLog = buildLog(id(WITHDRAW), "0x1", user4, 104, encodeWithdraw(parseEther("3000")))
    const depositLog = buildLog(id(DEPOSIT), "0x1", user5, 105, encodeDeposit(parseEther("5000")))
    const borrowLog = buildLog(id(BORROW), "0x1", user6, 106, encodeBorrow(user6, parseEther("4000"), parseEther("2000")))
    const zapDepositLog = buildLog(
      id(ZAP_DEPOSIT),
      "0x1",
      user7,
      107,
      encodeZapDeposit(parseEther("6000"), "0x3456789012345678901234567890123456789012", parseEther("7000"))
    )
    const depositAndBorrowLog = buildLog(
      id(DEPOSIT_AND_BORROW),
      "0x1",
      user8,
      108,
      encodeDepositAndBorrow(parseEther("8000"), parseEther("5000"), parseEther("3000"))
    )
    const zapDepositAndBorrowLog = buildLog(
      id(ZAP_DEPOSIT_AND_BORROW),
      "0x1",
      user9,
      109,
      encodeZapDepositAndBorrow(parseEther("9000"), parseEther("6000"), parseEther("4000"), "0x4567890123456789012345678901234567890123", parseEther("10000"))
    )
    const leverageLog = buildLog(
      id(LEVERAGE),
      "0x1",
      user10,
      110,
      encodeLeverage(parseEther("10000"), parseEther("8000"), parseEther("7000"), parseEther("5000"))
    )
    const zapLeverageLog = buildLog(
      id(ZAP_LEVERAGE),
      "0x1",
      user11,
      111,
      encodeZapLeverage(
        parseEther("12000"),
        parseEther("9000"),
        parseEther("8000"),
        parseEther("6000"),
        parseEther("7000"),
        "0x5678901234567890123456789012345678901234",
        parseEther("13000")
      )
    )
    const liquidateLog = buildLog(
      id(LIQUIDATE),
      "0x1",
      user12,
      112,
      encodeLiquidate(parseEther("5000"), parseEther("2000"), parseEther("500"), parseEther("3000"), "0x6789012345678901234567890123456789012345")
    )
    const selfLiquidateLog = buildLog(
      id(SELF_LIQUIDATE),
      "0x1",
      user13,
      113,
      encodeSelfLiquidate(parseEther("4000"), parseEther("1500"), parseEther("2500"), "0x7890123456789012345678901234567890123456")
    )
    const seizeCollateralLog = buildLog(id(SEIZE_COLLATERAL), "0x1", user14, 114, encodeSeizeCollateral(parseEther("1000"), parseEther("2000")))

    const map = new Map<string, number>()
    map.set("0x1", 1)

    const { activeBorrowActions, sortedAndParsedEvents, blockIds } = userMarketService.sortUserMarketLogs(
      [
        repayLog,
        repayAndWithdrawLog,
        zapRepayLog,
        zapRepayAndWithdrawLog,
        withdrawLog,
        depositLog,
        borrowLog,
        zapDepositLog,
        depositAndBorrowLog,
        zapDepositAndBorrowLog,
        leverageLog,
        zapLeverageLog,
        liquidateLog,
        selfLiquidateLog,
        seizeCollateralLog,
      ],
      map
    )

    // Test that all 15 block IDs are unique
    expect(blockIds.length).toBe(15)
    expect(new Set(blockIds).size).toBe(15)

    // Test that all events affecting active borrows are captured (12 events should impact active borrows)
    expect(activeBorrowActions.length).toBe(12)

    // Test that all event types are properly sorted
    expect(sortedAndParsedEvents.Repay.length).toBe(1)
    expect(sortedAndParsedEvents.RepayAndWithdraw.length).toBe(1)
    expect(sortedAndParsedEvents.ZapRepay.length).toBe(1)
    expect(sortedAndParsedEvents.ZapRepayAndWithdraw.length).toBe(1)
    expect(sortedAndParsedEvents.Withdraw.length).toBe(1)
    expect(sortedAndParsedEvents.Deposit.length).toBe(1)
    expect(sortedAndParsedEvents.Borrow.length).toBe(1)
    expect(sortedAndParsedEvents.ZapDeposit.length).toBe(1)
    expect(sortedAndParsedEvents.DepositAndBorrow.length).toBe(1)
    expect(sortedAndParsedEvents.ZapDepositAndBorrow.length).toBe(1)
    expect(sortedAndParsedEvents.Leverage.length).toBe(1)
    expect(sortedAndParsedEvents.ZapLeverage.length).toBe(1)
    expect(sortedAndParsedEvents.Liquidate.length).toBe(1)
    expect(sortedAndParsedEvents.SelfLiquidate.length).toBe(1)
    expect(sortedAndParsedEvents.SeizeCollateral.length).toBe(1)

    // Test that events are properly parsed with correct data
    expect(sortedAndParsedEvents.Repay[0].account.toLowerCase()).toBe(user0.toLowerCase())
    expect(sortedAndParsedEvents.RepayAndWithdraw[0].account.toLowerCase()).toBe(user1.toLowerCase())
    expect(sortedAndParsedEvents.ZapRepay[0].account.toLowerCase()).toBe(user2.toLowerCase())
    expect(sortedAndParsedEvents.ZapRepayAndWithdraw[0].account.toLowerCase()).toBe(user3.toLowerCase())
    expect(sortedAndParsedEvents.Withdraw[0].account.toLowerCase()).toBe(user4.toLowerCase())
    expect(sortedAndParsedEvents.Deposit[0].account.toLowerCase()).toBe(user5.toLowerCase())
    expect(sortedAndParsedEvents.Borrow[0].account.toLowerCase()).toBe(user6.toLowerCase())
    expect(sortedAndParsedEvents.ZapDeposit[0].account.toLowerCase()).toBe(user7.toLowerCase())
    expect(sortedAndParsedEvents.DepositAndBorrow[0].account.toLowerCase()).toBe(user8.toLowerCase())
    expect(sortedAndParsedEvents.ZapDepositAndBorrow[0].account.toLowerCase()).toBe(user9.toLowerCase())
    expect(sortedAndParsedEvents.Leverage[0].account.toLowerCase()).toBe(user10.toLowerCase())
    expect(sortedAndParsedEvents.ZapLeverage[0].account.toLowerCase()).toBe(user11.toLowerCase())
    expect(sortedAndParsedEvents.Liquidate[0].account.toLowerCase()).toBe(user12.toLowerCase())
    expect(sortedAndParsedEvents.SelfLiquidate[0].account.toLowerCase()).toBe(user13.toLowerCase())
    expect(sortedAndParsedEvents.SeizeCollateral[0].account.toLowerCase()).toBe(user14.toLowerCase())

    // Test that all events have correct market_id
    expect(sortedAndParsedEvents.Repay[0].market_id).toBe(1)
    expect(sortedAndParsedEvents.RepayAndWithdraw[0].market_id).toBe(1)
    expect(sortedAndParsedEvents.ZapRepay[0].market_id).toBe(1)
    expect(sortedAndParsedEvents.ZapRepayAndWithdraw[0].market_id).toBe(1)
    expect(sortedAndParsedEvents.Withdraw[0].market_id).toBe(1)
    expect(sortedAndParsedEvents.Deposit[0].market_id).toBe(1)
    expect(sortedAndParsedEvents.Borrow[0].market_id).toBe(1)
    expect(sortedAndParsedEvents.ZapDeposit[0].market_id).toBe(1)
    expect(sortedAndParsedEvents.DepositAndBorrow[0].market_id).toBe(1)
    expect(sortedAndParsedEvents.ZapDepositAndBorrow[0].market_id).toBe(1)
    expect(sortedAndParsedEvents.Leverage[0].market_id).toBe(1)
    expect(sortedAndParsedEvents.ZapLeverage[0].market_id).toBe(1)
    expect(sortedAndParsedEvents.Liquidate[0].market_id).toBe(1)
    expect(sortedAndParsedEvents.SelfLiquidate[0].market_id).toBe(1)
    expect(sortedAndParsedEvents.SeizeCollateral[0].market_id).toBe(1)

    // Test that active borrow actions are properly created for events that impact active borrows
    const { inserted, deleted } = await activeBorrowersService.updateActiveBorrowers(activeBorrowActions)

    // All 12 events that impact active borrows should result in insertions/deletions
    expect(inserted.length).toBe(11)
    expect(deleted.length).toBe(12)
  })

  it("Decode and sort properly - original test case", async () => {
    const activeBorrowesRepository = {
      insertActiveBorrowers: vi.fn(),
      deleteActiveBorrowers: vi.fn(),
    } as any as ActiveBorrowersRepository

    const userEventsRepository = {} as any as UserEventsRepository

    const activeBorrowersService = new ActiveBorrowersService(activeBorrowesRepository)

    const user0 = "0x4838b106fce9647bdf1e7877bf73ce8b0bad5f97"
    const user1 = "0x16c473448e770ff647c69cbe19e28528877fba1b"

    const userMarketService = new UserMarketService(userEventsRepository)

    const borrowLog0 = buildLog(id(BORROW), "0x1", user0, 100, encodeBorrow(user0, parseEther("650000"), parseEther("3000")))
    const repayLog0 = buildLog(id(REPAY), "0x1", user0, 100, encodeRepay(user0, parseEther("650000"), parseEther("3000")))
    const deposit1 = buildLog(id(DEPOSIT), "0x1", user1, 100, encodeDeposit(parseEther("10000")))
    const depositAndBorrow1 = buildLog(
      id(DEPOSIT_AND_BORROW),
      "0x1",
      user1,
      150,
      encodeDepositAndBorrow(parseEther("100000"), parseEther("50000"), parseEther("3000"))
    )

    const map = new Map<string, number>()
    map.set("0x1", 1)

    const { activeBorrowActions, sortedAndParsedEvents, blockIds } = userMarketService.sortUserMarketLogs(
      [repayLog0, borrowLog0, deposit1, depositAndBorrow1],
      map
    )

    expect(blockIds.length).toBe(2)
    expect(activeBorrowActions.length).toBe(3)

    const { inserted, deleted } = await activeBorrowersService.updateActiveBorrowers(activeBorrowActions)

    expect(inserted.length).toBe(2)
    expect(deleted.length).toBe(3)

    expect(sortedAndParsedEvents.Borrow.length).toBe(1)
    expect(sortedAndParsedEvents.Repay.length).toBe(1)
    expect(sortedAndParsedEvents.DepositAndBorrow.length).toBe(1)
    expect(sortedAndParsedEvents.Deposit.length).toBe(1)
  })
})
