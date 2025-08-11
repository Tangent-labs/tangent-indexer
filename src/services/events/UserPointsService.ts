import { Log } from "ethers"
import { Prisma } from "@prisma/client"
import { UserPointsRepository } from "db/UserPointsRepository"
import { parseTransferEvent } from "../../eventFectcher/marketUserEvents.parsers"

export type SortedEvents = {
  Transfer: Prisma.transfer_eventsUncheckedCreateInput[]
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

  updateTasks = async (
    relevantEvents: Prisma.transfer_eventsUncheckedCreateInput[],
    tasks: {
      id: bigint
      token: { address: string }
    }[]
  ) => {
    const tasksToClose: { id: bigint; closed: Date }[] = []
    const tasksToCreate: Prisma.user_tasksUncheckedCreateInput[] = []
    const createdIndexByKey = new Map<string, number>() // maps synthetic key -> index in tasksToCreate

    // Preload open tasks from DB
    const allUserAddresses = new Set<string>()
    relevantEvents.forEach((event) => {
      if (event.from) allUserAddresses.add(event.from.toLowerCase())
      if (event.to) allUserAddresses.add(event.to.toLowerCase())
    })

    const allTaskIds = tasks.map((task) => task.id)
    const openUserTasks = await this.userPointsRepository.getOpenedTasks(Array.from(allUserAddresses), allTaskIds)

    // Map key: `${user}_${taskId}` -> open task
    const openTaskMap = new Map<string, (typeof openUserTasks)[0]>()
    for (const ot of openUserTasks) {
      const key = `${ot.user_address.toLowerCase()}_${ot.task_id}`
      openTaskMap.set(key, ot)
    }

    // Helper to create and track new tasks in-memory
    const createAndTrack = (userAddress: string, taskId: bigint, start: Date, amount: string) => {
      const newTask: Prisma.user_tasksUncheckedCreateInput = {
        task_id: taskId,
        user_address: userAddress,
        start,
        amount,
        closed: null,
      }
      const idx = tasksToCreate.push(newTask) - 1
      createdIndexByKey.set(`${userAddress}_${taskId}_${start.getTime()}`, idx)

      // Also put it into the map so later events see it
      openTaskMap.set(`${userAddress}_${taskId}`, {
        id: BigInt(0), // synthetic
        task_id: taskId,
        user_address: userAddress,
        start,
        amount,
        closed: null,
      })
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
        const key = `${userAddress}_${task.id}`
        const isSender = userAddress === event.from?.toLowerCase()

        const openTask = openTaskMap.get(key)

        if (openTask) {
          // Close the open task
          if (openTask.id !== BigInt(0)) {
            // From DB
            tasksToClose.push({ id: openTask.id, closed: new Date(event.block_date) })
          } else {
            // Created earlier in this same batch
            const idx = createdIndexByKey.get(`${userAddress}_${task.id}_${openTask.start.getTime()}`)
            if (idx !== undefined) {
              tasksToCreate[idx].closed = new Date(event.block_date)
            }
          }

          // Calculate new amount and open a new task if needed
          const currentAmount = Number(openTask.amount)
          const delta = Number(event.amount)
          const newAmount = isSender ? currentAmount - delta : currentAmount + delta

          if (newAmount !== 0) {
            createAndTrack(userAddress, task.id, new Date(event.block_date), newAmount.toString())
          } else {
            openTaskMap.delete(key)
          }
        } else {
          // No open task exists → create one
          createAndTrack(userAddress, task.id, new Date(event.block_date), event.amount)
        }
      }
    }

    await this.userPointsRepository.updateProcessedTasks(tasksToClose, tasksToCreate)
  }

  updateUserTasks = async (startBlock: number) => {
    const { tasks, relevantEvents } = await this.userPointsRepository.fetchTasksEventsAndAddresses(startBlock)

    relevantEvents.sort((a, b) => {
      if (a.block_id !== b.block_id) return a.block_id - b.block_id
      return a.block_date.getTime() - b.block_date.getTime()
    })

    await this.updateTasks(relevantEvents, tasks)
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
