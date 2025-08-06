import { describe, expect, it } from "vitest"
import { AbiCoder, AddressLike, id, JsonRpcProvider, Log, parseEther } from "ethers"
import { encodeTransfer, TRANSFER } from "../../resources/eventSignatures"
import { UserPointsService } from "services/events/UserPointsService"
import { UserPointsRepository } from "db/UserPointsRepository"

function buildLog(topicId: string, from: AddressLike, to: AddressLike, blockNumber: number, data: string) {
  const fromEncoded = AbiCoder.defaultAbiCoder().encode(["address"], [from])
  const toEncoded = AbiCoder.defaultAbiCoder().encode(["address"], [to])

  return new Log(
    {
      topics: [topicId, fromEncoded, toEncoded],
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

describe("UserPointsService", () => {
  it("Decode and sort transfer logs", async () => {
    const userPointsRepository = {} as any as UserPointsRepository

    const user0 = "0x4838b106fce9647bdf1e7877bf73ce8b0bad5f97"
    const user1 = "0x16c473448e770ff647c69cbe19e28528877fba1b"

    const userPointsService = new UserPointsService(userPointsRepository)

    const transfer0 = buildLog(id(TRANSFER), user0, user1, 100, encodeTransfer(user0, user1, parseEther("1000000000000000000")))
    const transfer1 = buildLog(id(TRANSFER), user1, user0, 100, encodeTransfer(user1, user0, parseEther("1000000000000000000")))

    const { sortedAndParsedPointsEvents, pointsEventsBlockIds } = userPointsService.sortPointsActionsLogs([transfer0, transfer1])

    expect(pointsEventsBlockIds.length).toBe(1)
    expect(sortedAndParsedPointsEvents.Transfer.length).toBe(2)
  })
})
