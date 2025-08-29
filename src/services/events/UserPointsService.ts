import { Prisma } from "@prisma/client"
import { UserPointsRepository } from "db/UserPointsRepository"
import { parseTransferEvent } from "../../eventFectcher/marketUserEvents.parsers"
import { BlockService } from "../BlockService"
import { JsonRpcProvider, Log } from "ethers"

export type SortedEvents = {
  Transfer: Prisma.transfer_eventsUncheckedCreateInput[]
}

type TaskPoolItem = {
  id: bigint
  task_id: bigint
  user_address: string
  start: Date
  amount: string
  closed: Date | null
}

export class UserPointsService {
  userPointsRepository: UserPointsRepository

  constructor(userPointsRepository: UserPointsRepository) {
    this.userPointsRepository = userPointsRepository
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
    taskPool: TaskPoolItem[],
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
    const newTask: TaskPoolItem = {
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

  updateTasks = async (
    relevantEvents: Prisma.transfer_eventsUncheckedCreateInput[],
    tasks: {
      id: bigint
      token: { address: string }
    }[]
  ) => {
    const taskPool: TaskPoolItem[] = []

    const allUserAddresses = new Set<string>()
    relevantEvents.forEach((event) => {
      if (event.from) allUserAddresses.add(event.from.toLowerCase())
      if (event.to) allUserAddresses.add(event.to.toLowerCase())
    })

    const openUserTasks = await this.userPointsRepository.getOpenedTasks(
      Array.from(allUserAddresses),
      tasks.map((task) => task.id)
    )

    // Add all open tasks from DB to taskPool
    for (const openUserTask of openUserTasks) {
      taskPool.push(openUserTask as TaskPoolItem)
    }

    for (const event of relevantEvents) {
      const task = tasks.find((t) => t.token.address.toLowerCase() === event.token_address?.toLowerCase())

      if (!task) {
        console.warn(`No matching task for token ${event.token_address}, skipping`)
        continue
      }

      for (const userAddressRaw of [event.from, event.to]) {
        if (!userAddressRaw) continue
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
          continue
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

  /**
   *
   * @param startBlock used to check eligible bonus referral points
   * @param tasksWithPoints All data needed to upsert in the user_points table
   * @returns
   */
  bulkUpsertUserPoints = async (
    startBlock: number,
    tasksWithPoints: {
      points: number
      boostMultiplier: string
      avgPriceUsd: string | null
      timeRangeSeconds: number
      id: bigint // user_task_id
      task_id: bigint
      user_address: string
      start: Date
      closed: Date | null
      amount: string
    }[],
    provider: JsonRpcProvider
  ) => {
    if (!tasksWithPoints?.length) return

    const startBlockTimestamp = await this.userPointsRepository.getBlockTimeAtOrBefore(startBlock, provider)

    const batch = tasksWithPoints.map((t) => ({
      user_task_id: t.id,
      task_id: t.task_id,
      child_address: t.user_address.toLowerCase(),
      new_points: Math.max(0, Math.round(t.points)),
    }))

    await this.userPointsRepository.upsertUserPointsAndReferralPoints(batch, startBlockTimestamp)
  }

  //
  //
  //

  computePointsForTasks = async (
    currentTasks: {
      boostMultiplier: string
      avgPriceUsd: string | null
      timeRangeSeconds: number
      id: bigint
      task_id: bigint
      user_address: string
      start: Date
      closed: Date | null
      amount: string
    }[]
  ) => {
    return await this.userPointsRepository.computePointsForTasks(currentTasks)
  }

  computeClosestBoostForTasks = async (
    currentTasks: {
      avgPriceUsd: string | null
      timeRangeSeconds: number
      id: bigint
      task_id: bigint
      user_address: string
      start: Date
      closed: Date | null
      amount: string
    }[],
    nowBlockTimestamp: number
  ) => {
    return await this.userPointsRepository.computeTimeWeightedBoostForTasks(currentTasks, nowBlockTimestamp)
  }

  computeTokenPriceForTask = async (
    currentTasks: {
      timeRangeSeconds: number
      id: bigint
      task_id: bigint
      user_address: string
      start: Date
      closed: Date | null
      amount: string
    }[]
  ) => {
    return await this.userPointsRepository.computeTokenPriceForTask(currentTasks)
  }

  computeTimeRangeForOpenUserTasks = async (blockId: number, nowBlockTimestamp: number, provider: JsonRpcProvider) => {
    const tasks = await this.userPointsRepository.fetchTasksToComputeRangeFor(blockId, provider)

    const now = new Date(nowBlockTimestamp * 1000)

    return tasks.map((task) => {
      const endDate = task.closed ?? now
      const secondsDiff = Math.floor((endDate.getTime() - task.start.getTime()) / 1000)
      return {
        ...task,
        timeRangeSeconds: Math.max(secondsDiff, 0),
      }
    })
  }

  updateUserTasks = async (startBlock: number) => {
    const { tasks, relevantEvents } = await this.userPointsRepository.fetchTasksEventsAndAddresses(startBlock)

    relevantEvents.sort((a, b) => {
      if (a.block_id !== b.block_id) return a.block_id - b.block_id
      return a.block_date.getTime() - b.block_date.getTime()
    })

    await this.updateTasks(relevantEvents, tasks)
  }

  processUserPoints = async (startBlock: number, endBlock: number, blockService: BlockService, providerURL: string) => {
    const provider = new JsonRpcProvider(providerURL)
    const [dateStartStr, dateEndStr] = await Promise.all([
      blockService.getBlockTimestamp(startBlock, provider),
      blockService.getBlockTimestamp(endBlock, provider),
    ])

    const dateStart = new Date(dateStartStr * 1000)
    const dateEnd = new Date(dateEndStr * 1000)

    await this.userPointsRepository.computeUserPoints(dateStart, dateEnd)
  }

  processGodfatherPoints = async () => {
    await this.userPointsRepository.computeGodfatherPoints()
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
    return await this.userPointsRepository.getERC20ToTrack()
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
