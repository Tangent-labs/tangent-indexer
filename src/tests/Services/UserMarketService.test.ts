import { describe, expect, it, vi } from "vitest"

import { AbiCoder, AddressLike, id, JsonRpcProvider, Log, parseEther } from "ethers"
import { UserMarketService } from "../../services/events/UserMarketService"
import { BORROW, DEPOSIT, DEPOSIT_AND_BORROW, encodeBorrow, encodeDeposit, encodeDepositAndBorrow, encodeRepay, REPAY } from "../../resources/eventSignatures"
import { ActiveBorrowersService } from "../../services/ActiveBorrowersService"
import { ActiveBorrowersRepository } from "../../db/ActiveBorrowersRepository"
import { UserEventsRepository } from "db/UserEventsRepository"

function buildLog(topicId: string, user: AddressLike, blockNumber: number, data: string) {
  const userEncoded = AbiCoder.defaultAbiCoder().encode(["address"], [user])

  return new Log(
    {
      topics: [topicId, userEncoded],
      address: "0x1",
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
  it("Decode and sort properly", async () => {
    const activeBorrowesRepository = {
      insertActiveBorrowers: vi.fn(),
      deleteActiveBorrowers: vi.fn(),
    } as any as ActiveBorrowersRepository

    const userEventsRepository = {} as any as UserEventsRepository

    const activeBorrowersService = new ActiveBorrowersService(activeBorrowesRepository)

    const user0 = "0x4838b106fce9647bdf1e7877bf73ce8b0bad5f97"
    const user1 = "0x16c473448e770ff647c69cbe19e28528877fba1b"

    const userMarketService = new UserMarketService(userEventsRepository)

    const borrowLog0 = buildLog(id(BORROW), user0, 100, encodeBorrow(user0, parseEther("650000")))
    const repayLog0 = buildLog(id(REPAY), user0, 100, encodeRepay(user0, parseEther("650000"), true))

    const depositAndBorrow1 = buildLog(id(DEPOSIT_AND_BORROW), user1, 150, encodeDepositAndBorrow(parseEther("100000"), parseEther("50000")))
    const deposit1 = buildLog(id(DEPOSIT), user1, 100, encodeDeposit(parseEther("10000")))

    const { activeBorrowActions, sortedAndParsedEvents, blockIds } = userMarketService.sortUserMarketLogs([repayLog0, borrowLog0, depositAndBorrow1, deposit1])

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
