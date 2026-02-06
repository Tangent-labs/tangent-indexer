import { beforeEach, describe, expect, it, vi } from "vitest"
import { UserPointsLPRepository } from "../../db/Points/UserPointsLPRepository.js"
import { UserPointsService } from "../../services/events/UserPointsService.js"
import { encodeTransfer, TRANSFER } from "../../resources/eventSignatures.js"
import { AbiCoder, AddressLike, id, JsonRpcProvider, Log, parseEther, ZeroAddress } from "ethers"
import { ERC20Repository } from "../../db/ERC20Repository.js"
import { ActiveBorrowersRepository } from "../../db/ActiveBorrowersRepository.js"

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

const date0 = new Date("2025-08-26T08:07:45.000Z")
const date1 = new Date("2025-08-26T08:08:45.000Z")
const date2 = new Date("2025-08-26T08:09:45.000Z")

// --------------------------------------------
// sortPointsActionsLogs()
// --------------------------------------------
describe("UserPointsService", () => {
  it("Decode and sort transfer logs", async () => {
    const userPointsRepository = {} as any as UserPointsLPRepository

    const user0 = "0x4838b106fce9647bdf1e7877bf73ce8b0bad5f97"
    const user1 = "0x16c473448e770ff647c69cbe19e28528877fba1b"

    const erc20Repository = {
      getOpenedTasks: vi.fn(),
      updateProcessedTasks: vi.fn(),
    } as any as ERC20Repository

    const activeBorrowerRepository = {} as any as ActiveBorrowersRepository

    const userPointsService = new UserPointsService(userPointsRepository, erc20Repository, activeBorrowerRepository)

    const transfer0 = buildLog(id(TRANSFER), user0, user1, 100, encodeTransfer(user0, user1, parseEther("1000000000000000000")))
    const transfer1 = buildLog(id(TRANSFER), user1, user0, 100, encodeTransfer(user1, user0, parseEther("1000000000000000000")))

    const { transferEvents, pointsEventsBlockIds } = userPointsService.sortPointsActionsLogs([transfer0, transfer1])

    expect(pointsEventsBlockIds.length).toBe(1)
    expect(transferEvents.length).toBe(2)
  })
})

// --------------------------------------------
// updateUserTasks() test
// --------------------------------------------
describe("UserPointsService.updateUserTasks", () => {
  const userPointsRepository = {
    fetchTasksEventsAndAddresses: vi.fn(),
    updateProcessedTasks: vi.fn(),
    getOpenedTasks: vi.fn(),
    getAddressesExcludedFromLpPoints: vi.fn(),
  } as any as UserPointsLPRepository

  // TODO Replace this
  const erc20Repository = {
    updateProcessedTasks: vi.fn(),
  } as any as ERC20Repository

  let userPointsService: UserPointsService
  let getOpenedTasksSpy: ReturnType<typeof vi.spyOn>
  let fetchTasksEventsAndAddressesSpy: ReturnType<typeof vi.spyOn>
  vi.spyOn(userPointsRepository as any, "getAddressesExcludedFromLpPoints").mockResolvedValue([{ user: ZeroAddress }])

  beforeEach(() => {
    vi.clearAllMocks()
    const activeBorrowerRepository = {} as any as ActiveBorrowersRepository
    userPointsService = new UserPointsService(userPointsRepository, erc20Repository, activeBorrowerRepository)
    fetchTasksEventsAndAddressesSpy = vi.spyOn(userPointsRepository as any, "fetchTasksEventsAndAddresses").mockResolvedValue(undefined as any)
    getOpenedTasksSpy = vi.spyOn(userPointsRepository as any, "getOpenedTasks")
  })

  it("Should call updateTasks() with sorted events", async () => {
    const tasks = [
      { id: 1n, token: { address: "0x9b894b86f16ec30656ab6dd51e0fd620e70f630b" } },
      { id: 2n, token: { address: "0x042Eb27B32235B6cd99f74ba00e05c7166964019" } },
    ]

    const firstEvent = {
      id: 1n,
      token_address: "0x9b894b86f16ec30656ab6dd51e0fd620e70f630b",
      from: "0x0000000000000000000000000000000000000000",
      to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      amount: "10000000000000000000000",
      block_date: date0,
      block_id: 23218290,
      tx_hash: "0xHash",
    }
    const secondEvent = {
      id: 2n,
      token_address: "0x9b894b86f16ec30656ab6dd51e0fd620e70f630b",
      from: "0x0000000000000000000000000000000000000000",
      to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      amount: "2000000000000000000000",
      block_date: date1,
      block_id: 23218291,
      tx_hash: "0xHash",
    }
    const thirdEvent = {
      id: 3n,
      token_address: "0x9b894b86f16ec30656ab6dd51e0fd620e70f630b",
      from: "0x0000000000000000000000000000000000000000",
      to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      amount: "15000000000000000000000",
      block_date: date2,
      block_id: 23218291,
      tx_hash: "0xHash",
    }

    fetchTasksEventsAndAddressesSpy.mockResolvedValue({ tasks, transferEvents: [thirdEvent, secondEvent, firstEvent] })
    getOpenedTasksSpy.mockResolvedValue([])

    const startBlock = 1234567
    const endBlock = 1236567
    const blockDates = new Map<number, number>()
    blockDates.set(1234567, 1)
    blockDates.set(1236567, 100)
    await userPointsService.updateLPUserTasks(startBlock, endBlock, blockDates)

    expect(userPointsRepository.fetchTasksEventsAndAddresses).toHaveBeenCalledWith(startBlock, endBlock, blockDates)
  })

  it("Should handle empty events", async () => {
    fetchTasksEventsAndAddressesSpy.mockResolvedValue({ tasks: [], transferEvents: [] })
    const blockDates = new Map<number, number>()
    blockDates.set(9, 1)
    blockDates.set(10, 100)
    await userPointsService.updateLPUserTasks(9, 10, blockDates)
    expect(userPointsRepository.fetchTasksEventsAndAddresses).toHaveBeenCalledWith(9, 10, blockDates)
  })
})

// --------------------------------------------
// updateTasks()
// --------------------------------------------
describe("UserPointsService.updateTasks", () => {
  const userPointsRepository = {
    getOpenedTasks: vi.fn(),
    updateProcessedTasks: vi.fn(),
    fetchTasksEventsAndAddresses: vi.fn(),
    getAddressesExcludedFromLpPoints: vi.fn(),
  } as any as UserPointsLPRepository

  const erc20Repository = {
    getOpenedTasks: vi.fn(),
    updateProcessedTasks: vi.fn(),
  } as any as ERC20Repository

  const activeBorrowerRepository = {} as any as ActiveBorrowersRepository

  let userPointsService: UserPointsService
  let getOpenedTasksSpy: ReturnType<typeof vi.spyOn>
  let updateProcessedTasksSpy: ReturnType<typeof vi.spyOn>
  let fetchTasksEventsAndAddressesSpy: ReturnType<typeof vi.spyOn>
  vi.spyOn(userPointsRepository as any, "getAddressesExcludedFromLpPoints").mockResolvedValue([{ user: ZeroAddress }])

  beforeEach(() => {
    vi.clearAllMocks()
    userPointsService = new UserPointsService(userPointsRepository, erc20Repository, activeBorrowerRepository)
    getOpenedTasksSpy = vi.spyOn(userPointsRepository as any, "getOpenedTasks").mockResolvedValue(undefined as any)
    updateProcessedTasksSpy = vi.spyOn(userPointsRepository as any, "updateProcessedTasks")
    fetchTasksEventsAndAddressesSpy = vi.spyOn(userPointsRepository as any, "fetchTasksEventsAndAddresses")
  })

  const USG = "0xUSGTOKEN"
  const USER1 = "0x1"
  const USER2 = "0x2"

  it("Should not open any tasks", async () => {
    getOpenedTasksSpy.mockResolvedValue([])
    fetchTasksEventsAndAddressesSpy.mockResolvedValue({ tasks: [{ id: 1n, token: { address: USG } }], transferEvents: [] })
    const blockDates = new Map<number, number>()
    blockDates.set(1, 1)
    blockDates.set(100, 100)
    await userPointsService.updateLPUserTasks(1, 100, blockDates)

    expect(userPointsRepository.getOpenedTasks).toHaveBeenCalledWith([], [1n])

    const [tasksToClose, tasksToCreate] = updateProcessedTasksSpy.mock.calls[0]

    expect(tasksToClose).toEqual([])
    expect(tasksToCreate).toHaveLength(0)
  })

  it("Should open 1 task for the user when no open tasks exist", async () => {
    const newEvent = {
      id: 2954n,
      token_address: USG,
      from: ZeroAddress,
      to: USER2,
      amount: parseEther("200").toString(),
      block_date: date0,
      block_id: 23224248,
      tx_hash: "0xHash",
    }

    getOpenedTasksSpy.mockResolvedValue([])
    fetchTasksEventsAndAddressesSpy.mockResolvedValue({ tasks: [{ id: 1n, token: { address: USG } }], transferEvents: [newEvent] })
    const blockDates = new Map<number, number>()
    blockDates.set(1, 1)
    blockDates.set(100, 100)
    await userPointsService.updateLPUserTasks(1, 100, blockDates)

    expect(userPointsRepository.getOpenedTasks).toHaveBeenCalledWith([USER2.toLowerCase()], [1n])

    expect(userPointsRepository.updateProcessedTasks).toHaveBeenCalledWith(
      [],
      [
        {
          amount: parseEther("200").toString(),
          start_date: date0,
          closed_date: null,
          task_id: 1n,
          user_address: USER2,
        },
      ]
    )
  })

  it("Should open 1 new task for the user and close an existing one", async () => {
    const newEvent = {
      id: 1n,
      token_address: USG,
      from: USER1,
      to: USER2,
      amount: parseEther("200"),
      block_date: date1,
      block_id: 23224248,
      tx_hash: "0xHash",
    }

    const openedTask = {
      id: 2953n,
      task_id: 906n,
      user_address: USER2,
      amount: parseEther("600000"),
      start_date: date0,
      closed_date: null,
    }

    getOpenedTasksSpy.mockResolvedValue([openedTask])
    fetchTasksEventsAndAddressesSpy.mockResolvedValue({ tasks: [{ id: 906n, token: { address: USG } }], transferEvents: [newEvent] })
    const blockDates = new Map<number, number>()
    blockDates.set(1, 1)
    blockDates.set(100, 100)
    await userPointsService.updateLPUserTasks(1, 100, blockDates)

    expect(userPointsRepository.getOpenedTasks).toHaveBeenCalledWith([USER1.toLowerCase(), USER2.toLowerCase()], [openedTask.task_id])

    expect(userPointsRepository.updateProcessedTasks).toHaveBeenCalledWith(
      [{ id: 2953n, closed_date: date1 }],
      [
        {
          amount: parseEther("200").toString(),
          start_date: date1,
          closed_date: null,
          task_id: 906n,
          user_address: USER1,
        },
        {
          amount: parseEther((600000 + 200).toString()).toString(),
          start_date: date1,
          closed_date: null,
          task_id: 906n,
          user_address: USER2,
        },
      ]
    )
  })

  it("Open 0 new task for the user and close the existing one", async () => {
    const newEvent = {
      id: 1,
      token_address: USG,
      from: USER2,
      to: USER1,
      amount: parseEther("200"),
      block_date: date1,
      block_id: 23224248,
      tx_hash: "0xHash",
    }

    const openedTask = {
      id: 2953n,
      task_id: 906n,
      user_address: USER2,
      amount: parseEther("200"),
      start_date: date0,
      closed_date: null,
    }

    getOpenedTasksSpy.mockResolvedValue([openedTask])
    fetchTasksEventsAndAddressesSpy.mockResolvedValue({ tasks: [{ id: 906n, token: { address: USG } }], transferEvents: [newEvent] })
    const blockDates = new Map<number, number>()
    blockDates.set(1, 1)
    blockDates.set(100, 100)
    await userPointsService.updateLPUserTasks(1, 100, blockDates)

    expect(userPointsRepository.getOpenedTasks).toHaveBeenCalledWith([USER2.toLowerCase(), USER1.toLowerCase()], [openedTask.task_id])

    expect(userPointsRepository.updateProcessedTasks).toHaveBeenCalledWith(
      [{ id: 2953n, closed_date: date1 }],
      [
        {
          amount: parseEther("200").toString(),
          start_date: date1,
          closed_date: null,
          task_id: 906n,
          user_address: USER1,
        },
      ]
    )
  })

  it("Close one existing task, create a newly opened task closed within the batch, and open 1 new task", async () => {
    const openedTask = {
      id: 2953n,
      task_id: 906n,
      user_address: USER1,
      amount: parseEther("4000"),
      start_date: date0,
      closed_date: null,
    }

    const firstEvent = {
      id: 1n,
      token_address: USG,
      from: USER1,
      to: USER2,
      amount: parseEther("500"),
      block_date: date1,
      block_id: 23224248,
      tx_hash: "0xHash",
    }

    const secondEvent = {
      id: 2n,
      token_address: USG,
      from: USER2,
      to: USER1,
      amount: parseEther("200"),
      block_date: date2,
      block_id: 23224249,
      tx_hash: "0xHash",
    }

    getOpenedTasksSpy.mockResolvedValue([openedTask])
    fetchTasksEventsAndAddressesSpy.mockResolvedValue({ tasks: [{ id: 906n, token: { address: USG } }], transferEvents: [firstEvent, secondEvent] })

    const blockDates = new Map<number, number>()
    blockDates.set(1, 1)
    blockDates.set(100, 100)

    await userPointsService.updateLPUserTasks(1, 100, blockDates)

    expect(userPointsRepository.getOpenedTasks).toHaveBeenCalledWith([USER1.toLowerCase(), USER2.toLowerCase()], [openedTask.task_id])

    expect(userPointsRepository.updateProcessedTasks).toHaveBeenCalledWith(
      [{ id: 2953n, closed_date: date1 }],
      [
        {
          amount: parseEther("3500").toString(),
          start_date: date1,
          closed_date: date2,
          task_id: 906n,
          user_address: USER1,
        },
        {
          amount: parseEther("500").toString(),
          start_date: date1,
          closed_date: date2,
          task_id: 906n,
          user_address: USER2,
        },
        {
          amount: parseEther("300").toString(),
          start_date: date2,
          closed_date: null,
          task_id: 906n,
          user_address: USER2,
        },
        {
          amount: parseEther("3700").toString(),
          start_date: date2,
          closed_date: null,
          task_id: 906n,
          user_address: USER1,
        },
      ]
    )
  })
})
