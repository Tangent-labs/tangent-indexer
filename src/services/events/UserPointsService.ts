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
      token: {
        address: string
      }
    }[]
  ) => {
    for (const event of relevantEvents) {
      const task = tasks.find((t: any) => t.token.address.toLowerCase() === event.token_address?.toLowerCase())
      if (!task) {
        console.warn(`No matching task for token ${event.token_address}, skipping`)
        continue
      }

      const openTasks = await this.userPointsRepository.returnOpenedTasks(event, task)

      for (const openTask of openTasks) {
        const userAddress = openTask.user_address
        const isFromUser = userAddress.toLowerCase() === event.from?.toLowerCase()

        const newAmount = isFromUser ? Number(openTask.amount) - Number(event.amount) : Number(openTask.amount) + Number(event.amount)

        await this.userPointsRepository.updateTask(openTask, event)

        if (newAmount !== 0) {
          await this.userPointsRepository.createTask(task, userAddress, event, newAmount.toString())
        }
      }

      // Handle cases where no open task exists for a user
      for (const userAddress of [event.from, event.to]) {
        const hasOpenTask = openTasks.some((task) => task.user_address.toLowerCase() === userAddress.toLowerCase())
        if (!hasOpenTask) {
          await this.userPointsRepository.createTask(task, userAddress, event, event.amount)
        }
      }
    }
  }

  updateUserTasks = async (startBlock: number) => {
    const { tasks, relevantEvents } = await this.userPointsRepository.fetchTasksEventsAndAddresses(startBlock)
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
