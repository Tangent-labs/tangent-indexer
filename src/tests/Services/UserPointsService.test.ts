import { beforeEach, describe, expect, it, vi } from "vitest"
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

// --------------------------------------------
// sortPointsActionsLogs()
// --------------------------------------------
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

// --------------------------------------------
// updateUserTasks() test
// --------------------------------------------
describe("UserPointsService.updateUserTasks", () => {
  let userPointsService: UserPointsService
  let updateTasksSpy: ReturnType<typeof vi.spyOn>
  let fetchTasksEventsAndAddressesSpy: ReturnType<typeof vi.spyOn>

  const userPointsRepository = {
    fetchTasksEventsAndAddresses: vi.fn(),
    updateProcessedTasks: vi.fn(),
    getOpenedTasks: vi.fn(),
  } as any as UserPointsRepository

  beforeEach(() => {
    vi.clearAllMocks()
    userPointsService = new UserPointsService(userPointsRepository)
    updateTasksSpy = vi.spyOn(userPointsService as any, "updateTasks").mockResolvedValue(undefined as any)
    fetchTasksEventsAndAddressesSpy = vi.spyOn(userPointsRepository as any, "fetchTasksEventsAndAddresses").mockResolvedValue(undefined as any)
  })

  it("fetches, sorts relevantEvents (by block_id then block_date), and delegates to updateTasks()", async () => {
    const tasks = [
      { id: 1n, token: { address: "0x9b894b86f16ec30656ab6dd51e0fd620e70f630b" } },
      { id: 2n, token: { address: "0x042Eb27B32235B6cd99f74ba00e05c7166964019" } },
    ]

    const relevantEvents = [
      {
        id: 2708n,
        token_address: "0x9b894b86f16ec30656ab6dd51e0fd620e70f630b",
        from: "0x0000000000000000000000000000000000000000",
        to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        amount: "2000000000000000000000",
        block_date: new Date("2025-08-26T12:10:16.000Z"),
        block_id: 23218291,
        tx_hash: "0x69ed3e9f183beeaa5f656cff3e9f415ffb1f26e1edce9edde507e34a0266103b",
      },
      {
        id: 2707n,
        token_address: "0x9b894b86f16ec30656ab6dd51e0fd620e70f630b",
        from: "0x0000000000000000000000000000000000000000",
        to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        amount: "10000000000000000000000",
        block_date: new Date("2025-08-25T12:10:16.000Z"),
        block_id: 23218290,
        tx_hash: "0x69ed3e9f183beeaa5f656cff3e9f415ffb1f26e1edce9edde507e34a0266103b",
      },
      {
        id: 2709n,
        token_address: "0x9b894b86f16ec30656ab6dd51e0fd620e70f630b",
        from: "0x0000000000000000000000000000000000000000",
        to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        amount: "15000000000000000000000",
        block_date: new Date("2025-08-27T12:10:16.000Z"),
        block_id: 23218291,
        tx_hash: "0x69ed3e9f183beeaa5f656cff3e9f415ffb1f26e1edce9edde507e34a0266103b",
      },
    ]

    fetchTasksEventsAndAddressesSpy.mockResolvedValue({ tasks, relevantEvents })

    const startBlock = 1234567
    await userPointsService.updateUserTasks(startBlock)

    expect(userPointsRepository.fetchTasksEventsAndAddresses).toHaveBeenCalledWith(startBlock)

    expect(updateTasksSpy).toHaveBeenNthCalledWith(
      1,
      [
        {
          id: 2707n,
          token_address: "0x9b894b86f16ec30656ab6dd51e0fd620e70f630b",
          from: "0x0000000000000000000000000000000000000000",
          to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          amount: "10000000000000000000000",
          block_date: new Date("2025-08-25T12:10:16.000Z"),
          block_id: 23218290,
          tx_hash: "0x69ed3e9f183beeaa5f656cff3e9f415ffb1f26e1edce9edde507e34a0266103b",
        },
        {
          id: 2708n,
          token_address: "0x9b894b86f16ec30656ab6dd51e0fd620e70f630b",
          from: "0x0000000000000000000000000000000000000000",
          to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          amount: "2000000000000000000000",
          block_date: new Date("2025-08-26T12:10:16.000Z"),
          block_id: 23218291,
          tx_hash: "0x69ed3e9f183beeaa5f656cff3e9f415ffb1f26e1edce9edde507e34a0266103b",
        },

        {
          id: 2709n,
          token_address: "0x9b894b86f16ec30656ab6dd51e0fd620e70f630b",
          from: "0x0000000000000000000000000000000000000000",
          to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          amount: "15000000000000000000000",
          block_date: new Date("2025-08-27T12:10:16.000Z"),
          block_id: 23218291,
          tx_hash: "0x69ed3e9f183beeaa5f656cff3e9f415ffb1f26e1edce9edde507e34a0266103b",
        },
      ],
      tasks
    )
  })

  it("handles empty results", async () => {
    ;(userPointsRepository.fetchTasksEventsAndAddresses as any).mockResolvedValue({ tasks: [], relevantEvents: [] })
    await userPointsService.updateUserTasks(9)
    expect(userPointsRepository.fetchTasksEventsAndAddresses).toHaveBeenCalledWith(9)
    expect(updateTasksSpy).toHaveBeenCalledWith([], [])
  })
})

// --------------------------------------------
// updateTasks()
// --------------------------------------------
describe("UserPointsService.updateTasks", () => {
  let userPointsService: UserPointsService
  let getOpenedTasksSpy: ReturnType<typeof vi.spyOn>
  let updateProcessedTasksSpy: ReturnType<typeof vi.spyOn>

  const userPointsRepository = {
    getOpenedTasks: vi.fn(),
    updateProcessedTasks: vi.fn(),
  } as any as UserPointsRepository

  beforeEach(() => {
    vi.clearAllMocks()
    userPointsService = new UserPointsService(userPointsRepository)
    getOpenedTasksSpy = vi.spyOn(userPointsRepository as any, "getOpenedTasks").mockResolvedValue(undefined as any)
    updateProcessedTasksSpy = vi.spyOn(userPointsRepository as any, "updateProcessedTasks")
  })

  const USG = "0x9b894b86f16ec30656ab6dd51e0fd620e70f630b"
  const OXZERO = "0x0000000000000000000000000000000000000000"
  const USER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

  it("opens no new task when no open task exists (receiver path)", async () => {
    getOpenedTasksSpy.mockResolvedValue([])

    await userPointsService.updateTasks([], [{ id: 1n, token: { address: USG } }])

    expect(userPointsRepository.getOpenedTasks).toHaveBeenCalledWith([], [1n])

    const [tasksToClose, tasksToCreate] = updateProcessedTasksSpy.mock.calls[0]

    expect(tasksToClose).toEqual([])
    expect(tasksToCreate).toHaveLength(0)
  })

  it("Open 1 task when no open tasks exist", async () => {
    const newEvent = {
      id: 2954n,
      token_address: USG,
      from: OXZERO,
      to: USER,
      amount: "2000000000000000000000",
      block_date: "2025-08-26T08:23:45.000Z",
      block_id: 23224248,
      tx_hash: "0x6cd7bf047d9b6180500e4969b69484cc2ca0255620dd75887462db727e92bc83",
    }

    getOpenedTasksSpy.mockResolvedValue([])

    await userPointsService.updateTasks([newEvent], [{ id: 1n, token: { address: USG } }])

    expect(userPointsRepository.getOpenedTasks).toHaveBeenCalledWith([OXZERO.toLowerCase(), USER.toLowerCase()], [1n])

    const [tasksToClose, tasksToCreate] = updateProcessedTasksSpy.mock.calls[0]

    expect(tasksToClose).toEqual([])

    expect(tasksToCreate).toHaveLength(2)
    expect((tasksToCreate as Array<any>)[1]).toMatchObject({
      user_address: USER.toLowerCase(),
      task_id: 1n,
      start: new Date(newEvent?.block_date),
      amount: "2000000000000000000000",
    })
    expect(((tasksToCreate as Array<any>)[0] as any).closed).toBeNull()
  })

  it("Open 1 task and close an existing one", async () => {
    const newEvent = {
      id: 2954n,
      token_address: USG,
      from: OXZERO,
      to: USER,
      amount: "2000000000000000000000",
      block_date: "2025-08-26T08:23:45.000Z",
      block_id: 23224248,
      tx_hash: "0x6cd7bf047d9b6180500e4969b69484cc2ca0255620dd75887462db727e92bc83",
    }

    const openedTask = {
      id: 2953n,
      task_id: 906n,
      user_address: USER,
      amount: "6e+21",
      start: "2025-08-26T08:07:45.000Z",
      closed: null,
    }

    getOpenedTasksSpy.mockResolvedValue([openedTask])

    await userPointsService.updateTasks([newEvent], [{ id: openedTask.task_id, token: { address: USG } }])

    expect(userPointsRepository.getOpenedTasks).toHaveBeenCalledWith([OXZERO.toLowerCase(), USER.toLowerCase()], [openedTask.task_id])

    const [tasksToClose, tasksToCreate] = updateProcessedTasksSpy.mock.calls[0]

    expect(tasksToClose).toEqual([{ id: openedTask.id, closed: new Date(newEvent?.block_date) }])
    expect(tasksToCreate).toHaveLength(2)
    expect((tasksToCreate as Array<any>)[1]).toMatchObject({
      user_address: USER.toLowerCase(),
      task_id: openedTask.task_id,
      start: new Date(newEvent?.block_date),
      amount: "8e+21",
    })
    expect(((tasksToCreate as Array<any>)[0] as any).closed).toBeNull()
  })

  it("Open 0 new task and close the existing one", async () => {
    const newEvent = {
      id: 2954n,
      token_address: USG,
      from: USER,
      to: OXZERO,
      amount: "2000000000000000000000",
      block_date: "2025-08-26T08:23:45.000Z",
      block_id: 23224248,
      tx_hash: "0x6cd7bf047d9b6180500e4969b69484cc2ca0255620dd75887462db727e92bc83",
    }

    const openedTask = {
      id: 2953n,
      task_id: 906n,
      user_address: USER,
      amount: "2000000000000000000000",
      start: "2025-08-26T08:07:45.000Z",
      closed: null,
    }

    getOpenedTasksSpy.mockResolvedValue([openedTask])

    await userPointsService.updateTasks([newEvent], [{ id: openedTask.task_id, token: { address: USG } }])

    expect(userPointsRepository.getOpenedTasks).toHaveBeenCalledWith([USER.toLowerCase(), OXZERO.toLowerCase()], [openedTask.task_id])

    const [tasksToClose, tasksToCreate] = updateProcessedTasksSpy.mock.calls[0]

    expect(tasksToClose).toEqual([{ id: openedTask.id, closed: new Date(newEvent?.block_date) }])
    expect(tasksToCreate).toHaveLength(1)
  })
})
