import { Prisma } from "@prisma/client"
import { UserPointsRepository } from "db/UserPointsRepository"
import { Log } from "ethers"
import { parseTransferEvent } from "eventFectcher/marketUserEvents.parsers"

export type SortedEvents = {
  Transfer: Prisma.transfert_eventsUncheckedCreateInput[]
}

export class UserPointsService {
  userPointsRepository: UserPointsRepository

  constructor(userPointsRepository: UserPointsRepository) {
    this.userPointsRepository = userPointsRepository
  }

  processUserAddressesFromTransfers = async (startBlock: number, endBlock: number) => {
    const uniqueAddresses = await this.userPointsRepository.getUniqueAddressesFromTransfers(startBlock, endBlock)
    console.log(`Found ${uniqueAddresses.length} unique addresses to insert`)
    await this.userPointsRepository.insertAddresses(uniqueAddresses)
  }

  processTasks = async (
    relevantEvents: Prisma.transfert_eventsUncheckedCreateInput[],
    tasks: {
      id: bigint
      token: {
        symbol: string | null
        id: bigint
        name: string | null
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

        if (newAmount > 0.01) {
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

  processUserTasks = async (startBlock: number) => {
    const { tasks, relevantEvents } = await this.userPointsRepository.fetchTasksEventsAndAddresses(startBlock)
    await this.processTasks(relevantEvents, tasks)
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
