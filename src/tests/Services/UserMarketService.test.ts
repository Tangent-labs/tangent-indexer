import { describe, it, vi } from "vitest"

import { AbiCoder, AddressLike, id, JsonRpcProvider, Log, parseEther } from "ethers"
import { UserMarketService } from "../../services/events/UserMarketService"
import { BORROW, REPAY } from "../../eventFectcher/marketUserEvents.signatures"
import { ActiveBorrowersService } from "../../services/ActiveBorrowersService"
import { ActiveBorrowersRepository } from "../../db/ActiveBorrowersRepository"

vi.mock("../../eventFectcher/marketBorrowerEventFetcher", () => ({
  fetchBorrowLogs: vi.fn(),
}))

function buildLog(topicId: string, user: AddressLike, data: string) {
  const userEncoded = AbiCoder.defaultAbiCoder().encode(["address"], [user])

  return new Log(
    {
      topics: [topicId, userEncoded],
      address: "0x1",
      blockHash: "12",
      blockNumber: 1,
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

    const activeBorrowersService = new ActiveBorrowersService(activeBorrowesRepository)

    const user0 = "0x4838b106fce9647bdf1e7877bf73ce8b0bad5f97"
    const userMarketService = new UserMarketService()

    const borrowLog0 = buildLog(id(BORROW), user0, AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [user0, parseEther("650000")]))
    const repayLog0 = buildLog(id(REPAY), user0, AbiCoder.defaultAbiCoder().encode(["address", "uint256", "bool"], [user0, parseEther("650000"), true]))

    const { activeBorrowActions, sortedAndParsedEvents, uniqueBlockId } = userMarketService.sortUserMarketLogs([repayLog0, borrowLog0])

    const { toDelete, toInsert } = await activeBorrowersService.updateActiveBorrowers(activeBorrowActions)

    console.log(toInsert)
  })
})
