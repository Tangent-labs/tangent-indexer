import { beforeEach, describe, expect, it, vi } from "vitest"
import { UserPointsRepository } from "db/UserPointsRepository"
import { UserPointsService } from "services/events/UserPointsService"
import { encodeTransfer, TRANSFER } from "../../resources/eventSignatures"
import { AbiCoder, AddressLike, id, JsonRpcProvider, Log, parseEther } from "ethers"

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

  it("Should call updateTasks() with sorted events", async () => {
    const tasks = [
      { id: 1n, token: { address: "0x9b894b86f16ec30656ab6dd51e0fd620e70f630b" } },
      { id: 2n, token: { address: "0x042Eb27B32235B6cd99f74ba00e05c7166964019" } },
    ]

    const firstEvent = {
      id: 2707n,
      token_address: "0x9b894b86f16ec30656ab6dd51e0fd620e70f630b",
      from: "0x0000000000000000000000000000000000000000",
      to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      amount: "10000000000000000000000",
      block_date: new Date("2025-08-25T12:10:16.000Z"),
      block_id: 23218290,
      tx_hash: "0xHash",
    }
    const secondEvent = {
      id: 2708n,
      token_address: "0x9b894b86f16ec30656ab6dd51e0fd620e70f630b",
      from: "0x0000000000000000000000000000000000000000",
      to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      amount: "2000000000000000000000",
      block_date: new Date("2025-08-26T12:10:16.000Z"),
      block_id: 23218291,
      tx_hash: "0xHash",
    }
    const thirdEvent = {
      id: 2709n,
      token_address: "0x9b894b86f16ec30656ab6dd51e0fd620e70f630b",
      from: "0x0000000000000000000000000000000000000000",
      to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      amount: "15000000000000000000000",
      block_date: new Date("2025-08-27T12:10:16.000Z"),
      block_id: 23218291,
      tx_hash: "0xHash",
    }

    fetchTasksEventsAndAddressesSpy.mockResolvedValue({ tasks, relevantEvents: [thirdEvent, secondEvent, firstEvent] })

    const startBlock = 1234567
    const endBlock = 1236567
    await userPointsService.updateUserTasks(startBlock, endBlock)

    expect(userPointsRepository.fetchTasksEventsAndAddresses).toHaveBeenCalledWith(startBlock, endBlock)

    expect(updateTasksSpy).toHaveBeenNthCalledWith(1, [firstEvent, secondEvent, thirdEvent], tasks)
  })

  it("Should handle empty events", async () => {
    ;(userPointsRepository.fetchTasksEventsAndAddresses as any).mockResolvedValue({ tasks: [], relevantEvents: [] })
    await userPointsService.updateUserTasks(9, 10)
    expect(userPointsRepository.fetchTasksEventsAndAddresses).toHaveBeenCalledWith(9, 10)
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

  const USG = "0xUSGTOKEN"
  const USER1 = "0x1"
  const USER2 = "0x2"

  it("Should not open any tasks", async () => {
    getOpenedTasksSpy.mockResolvedValue([])

    await userPointsService.updateTasks([], [{ id: 1n, token: { address: USG } }])

    expect(userPointsRepository.getOpenedTasks).toHaveBeenCalledWith([], [1n])

    const [tasksToClose, tasksToCreate] = updateProcessedTasksSpy.mock.calls[0]

    expect(tasksToClose).toEqual([])
    expect(tasksToCreate).toHaveLength(0)
  })

  it("Should open 1 task for the user when no open tasks exist", async () => {
    const newEvent = {
      id: 2954n,
      token_address: USG,
      from: USER1,
      to: USER2,
      amount: "2000000000000000000000",
      block_date: "2025-08-26T08:23:45.000Z",
      block_id: 23224248,
      tx_hash: "0xHash",
    }

    getOpenedTasksSpy.mockResolvedValue([])

    await userPointsService.updateTasks([newEvent], [{ id: 1n, token: { address: USG } }])

    expect(userPointsRepository.getOpenedTasks).toHaveBeenCalledWith([USER1.toLowerCase(), USER2.toLowerCase()], [1n])

    const [tasksToClose, tasksToCreate] = updateProcessedTasksSpy.mock.calls[0]

    expect(tasksToClose).toEqual([])

    expect(tasksToCreate).toHaveLength(2)
    expect(tasksToCreate).toContainEqual({
      amount: "2000000000000000000000",
      closed: null,
      start: new Date("2025-08-26T08:23:45.000Z"),
      task_id: 1n,
      user_address: USER1,
    })
  })

  it("Should open 1 new task for the user and close an existing one", async () => {
    const newEvent = {
      id: 2954n,
      token_address: USG,
      from: USER1,
      to: USER2,
      amount: "2000000000000000000000",
      block_date: "2025-08-26T08:23:45.000Z",
      block_id: 23224248,
      tx_hash: "0xHash",
    }

    const openedTask = {
      id: 2953n,
      task_id: 906n,
      user_address: USER2,
      amount: "6e+21",
      start: "2025-08-26T08:07:45.000Z",
      closed: null,
    }

    getOpenedTasksSpy.mockResolvedValue([openedTask])

    await userPointsService.updateTasks([newEvent], [{ id: openedTask.task_id, token: { address: USG } }])

    expect(userPointsRepository.getOpenedTasks).toHaveBeenCalledWith([USER1.toLowerCase(), USER2.toLowerCase()], [openedTask.task_id])

    const [tasksToClose, tasksToCreate] = updateProcessedTasksSpy.mock.calls[0]

    expect(tasksToClose).toEqual([{ id: openedTask.id, closed: new Date(newEvent?.block_date) }])
    expect(tasksToCreate).toHaveLength(2)
    expect(tasksToCreate).toContainEqual({
      amount: "8e+21",
      closed: null,
      start: new Date("2025-08-26T08:23:45.000Z"),
      task_id: 906n,
      user_address: USER2,
    })
  })

  it("Open 0 new task for the user and close the existing one", async () => {
    const newEvent = {
      id: 2954n,
      token_address: USG,
      from: USER2,
      to: USER1,
      amount: "2000000000000000000000",
      block_date: "2025-08-26T08:23:45.000Z",
      block_id: 23224248,
      tx_hash: "0xHash",
    }

    const openedTask = {
      id: 2953n,
      task_id: 906n,
      user_address: USER2,
      amount: "2000000000000000000000",
      start: "2025-08-26T08:07:45.000Z",
      closed: null,
    }

    getOpenedTasksSpy.mockResolvedValue([openedTask])

    await userPointsService.updateTasks([newEvent], [{ id: openedTask.task_id, token: { address: USG } }])

    expect(userPointsRepository.getOpenedTasks).toHaveBeenCalledWith([USER2.toLowerCase(), USER1.toLowerCase()], [openedTask.task_id])

    const [tasksToClose, tasksToCreate] = updateProcessedTasksSpy.mock.calls[0]

    expect(tasksToClose).toEqual([{ id: openedTask.id, closed: new Date(newEvent?.block_date) }])

    expect(tasksToCreate).toHaveLength(1)
    expect(tasksToCreate).toContainEqual({
      amount: "2000000000000000000000",
      closed: null,
      start: new Date("2025-08-26T08:23:45.000Z"),
      task_id: 906n,
      user_address: USER1,
    })
  })

  it("Close one existing task, create a newly opened task closed within the batch, and open 1 new task", async () => {
    const firstEvent = {
      id: 2954n,
      token_address: USG,
      from: USER1,
      to: USER2,
      amount: "2000000000000000000000",
      block_date: "2025-08-26T08:23:45.000Z",
      block_id: 23224248,
      tx_hash: "0xHash",
    }

    const secondEvent = {
      id: 2955n,
      token_address: USG,
      from: USER1,
      to: USER2,
      amount: "1500000000000000000000",
      block_date: "2025-08-26T08:32:45.000Z",
      block_id: 23224249,
      tx_hash: "0xHash",
    }

    const openedTask = {
      id: 2953n,
      task_id: 906n,
      user_address: USER2,
      amount: "1000000000000000000000",
      start: "2025-08-26T08:07:45.000Z",
      closed: null,
    }

    getOpenedTasksSpy.mockResolvedValue([openedTask])

    await userPointsService.updateTasks([firstEvent, secondEvent], [{ id: openedTask.task_id, token: { address: USG } }])

    expect(userPointsRepository.getOpenedTasks).toHaveBeenCalledWith([USER1.toLowerCase(), USER2.toLowerCase()], [openedTask.task_id])

    const [tasksToClose, tasksToCreate] = updateProcessedTasksSpy.mock.calls[0]

    expect(tasksToClose).toEqual([{ id: openedTask.id, closed: new Date(firstEvent?.block_date) }])
    expect(tasksToCreate).toHaveLength(4)
    expect(tasksToCreate).toContainEqual({
      amount: "3e+21",
      closed: new Date("2025-08-26T08:32:45.000Z"),
      start: new Date("2025-08-26T08:23:45.000Z"),
      task_id: 906n,
      user_address: USER2,
    })
    expect(tasksToCreate).toContainEqual({
      amount: "4.5e+21",
      closed: null,
      start: new Date("2025-08-26T08:32:45.000Z"),
      task_id: 906n,
      user_address: USER2,
    })
  })
})
