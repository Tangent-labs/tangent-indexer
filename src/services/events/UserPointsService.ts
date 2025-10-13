import { Prisma } from "@prisma/client"
import { Log } from "ethers"

import { UserPointsRepository } from "../../db/UserPointsRepository.js"
import { ERC20Repository } from "../../db/ERC20Repository.js"

import { parseTransferEvent } from "../../eventFectcher/marketUserEvents.parsers.js"
import { BlockService } from "../BlockService.js"

export type SortedEvents = {
  Transfer: Prisma.transfer_eventsCreateManyInput[]
}

type LpUserTaskPoolItem = {
  id: bigint
  task_id: bigint
  user_address: string
  start: Date
  amount: string
  closed: Date | null
}

export class UserPointsService {
  userPointsRepository: UserPointsRepository
  erc20Repository: ERC20Repository

  constructor(userPointsRepository: UserPointsRepository, erc20Repository: ERC20Repository) {
    this.userPointsRepository = userPointsRepository
    this.erc20Repository = erc20Repository
  }

  retrieveUserAddressesFromTransfers = async (startBlock: number, endBlock: number) => {
    const uniqueAddresses = await this.userPointsRepository.getUniqueAddressesFromTransfers(startBlock, endBlock)
    await this.userPointsRepository.insertAddresses(uniqueAddresses)
  }

  // Helper to create and track new tasks in-memory
  createAndTrack = (
    userAddress: string,
    taskId: bigint,
    start: Date,
    amount: string,
    createdIndexByKey: Map<string, number>,
    taskPool: LpUserTaskPoolItem[],
    openTaskMap: Map<
      string,
      {
        id: bigint
        task_id: bigint
        user_address: string
        start: Date
        amount: string
        closed: Date | null
      }
    >
  ) => {
    const newTask: LpUserTaskPoolItem = {
      id: 0n, // synthetic
      task_id: taskId,
      user_address: userAddress,
      start,
      amount,
      closed: null,
    }

    const idx = taskPool.push(newTask) - 1
    createdIndexByKey.set(`${userAddress}_${taskId}_${start.getTime()}`, idx)

    openTaskMap.set(`${userAddress}_${taskId}`, newTask)
  }

  async updateLPUserTasks(startBlock: number, endBlock: number) {
    // Retrieve transfer events
    const { tasks, transferEvents } = await this.userPointsRepository.fetchTasksEventsAndAddresses(startBlock, endBlock)

    transferEvents.sort((a, b) => {
      if (a.block_id !== b.block_id) return a.block_id - b.block_id
      return a.block_date.getTime() - b.block_date.getTime()
    })

    // Merge all concerned account in one set
    const allUserAddresses = new Set<string>()
    transferEvents.forEach((event) => {
      allUserAddresses.add(event.from.toLowerCase())
      allUserAddresses.add(event.to.toLowerCase())
    })

    // TODO Delete zeroAddress

    const openUserTasks = await this.userPointsRepository.getOpenedTasks(
      Array.from(allUserAddresses),
      tasks.map((task) => task.id)
    )

    const taskPool: LpUserTaskPoolItem[] = []

    // Add all open tasks from DB to taskPool
    for (const openUserTask of openUserTasks) {
      taskPool.push(openUserTask as LpUserTaskPoolItem)
    }

    for (const event of transferEvents) {
      const task = tasks.find((t) => t.token.address.toLowerCase() === event.token_address?.toLowerCase())

      if (!task) {
        console.warn(`No matching task for token ${event.token_address}, skipping`)
        break
      }

      for (const userAddressRaw of [event.from, event.to]) {
        const userAddress = userAddressRaw.toLowerCase()
        const isSender = userAddress === event.from?.toLowerCase()

        // Find open task in taskPool
        const openTask = taskPool.find((t) => t.user_address.toLowerCase() === userAddress && t.task_id === task.id && t.closed === null)

        if (!openTask) {
          taskPool.push({
            id: 0n, // synthetic
            task_id: task.id,
            user_address: userAddress,
            start: new Date(event.block_date),
            amount: event.amount,
            closed: null,
          })
        }

        if (openTask) {
          const closedAt = new Date(event.block_date)
          // Close the existing task
          openTask.closed = closedAt

          // Calculate new amount and create a new task if needed
          const currentAmount = Number(openTask.amount)
          const delta = Number(event.amount)
          const newAmount = isSender ? currentAmount - delta : currentAmount + delta

          if (newAmount !== 0) {
            // Create new open task
            taskPool.push({
              id: 0n, // synthetic
              task_id: task.id,
              user_address: userAddress,
              start: new Date(event.block_date),
              amount: newAmount.toString(),
              closed: null,
            })
          }
        }
      }
    }
    // const taskToclose= openTaskMap.values().filter((t) => t.closed !== null && id!==Bigint(0))
    // const tasksToCreate= openTaskMap.values().filter((t) => id===Bigint(0))

    const tasksToClose = taskPool.filter((t) => t.id !== 0n && t.closed !== null).map((t) => ({ id: t.id, closed: t.closed as Date }))

    // Remove "ids=0n" for prisma not to push them
    const tasksToCreate = taskPool
      .filter((t) => t.id === 0n)
      .map((el) => {
        return {
          task_id: el.task_id,
          user_address: el.user_address,
          start: el.start,
          closed: el.closed,
          amount: el.amount,
        }
      })

    await this.userPointsRepository.updateProcessedTasks(tasksToClose, tasksToCreate)
  }

  processUserPoints = async (startBlock: number, endBlock: number, blockService: BlockService, providerURL: string) => {
    const blockDates = await blockService.fetchBlockTimestamps([startBlock, endBlock], providerURL)
    await this.userPointsRepository.computeUserPoints(blockDates.get(startBlock)!, blockDates.get(endBlock)!)
  }

  insertEvents = async (sortedParsedEvents: SortedEvents) => {
    await this.userPointsRepository.insertTransfers(sortedParsedEvents.Transfer)
  }

  replaceDates = (sortedParsedEvents: SortedEvents, blockInfos: Map<number, number>) => {
    Object.values(sortedParsedEvents).forEach((v) => {
      v.forEach((event) => {
        event.block_date = new Date(blockInfos.get(event.block_id)! * 1_000)
      })
    })

    return { sortedParsedEvents }
  }

  getERC20ToTrack = async () => {
    return await this.erc20Repository.getERC20ToTrack()
  }

  sortPointsActionsLogs = (logs: Log[]) => {
    const sortedAndParsedPointsEvents: SortedEvents = {
      Transfer: [],
    }

    const uniqueBlockId: Set<number> = new Set()

    logs.forEach((log) => {
      const transferEvent = parseTransferEvent(log)
      uniqueBlockId.add(log.blockNumber)
      sortedAndParsedPointsEvents.Transfer.push(transferEvent)
    })

    return { sortedAndParsedPointsEvents, pointsEventsBlockIds: Array.from(uniqueBlockId) }
  }
}
