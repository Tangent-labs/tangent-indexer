import { UserPointsRepository } from "db/UserPointsRepository"
import { Prisma } from "@prisma/client"
import { Log } from "ethers"
import { getUserAddressFromTransfer, parseTransferEvent } from "eventFectcher/marketUserEvents.parsers"

export type SortedEvents = {
  Transfer: Prisma.transfert_eventsCreateInput[]
}

export class UserPointsService {
  userPointsRepository: UserPointsRepository
  constructor(userPointsRepository: UserPointsRepository) {
    this.userPointsRepository = userPointsRepository
  }

  async insertEvents(sortedParsedEvents: SortedEvents) {
    await this.userPointsRepository.insertTransfers(sortedParsedEvents.Transfer)
  }

  async sortAndInsertUserAddresses(logs: Log[]) {
    const sortedAndParsedUsers: Prisma.user_addressesCreateInput[] = []

    logs.forEach((log) => {
      const transferEvent = getUserAddressFromTransfer(log)

      sortedAndParsedUsers.push(transferEvent)
    })

    await this.userPointsRepository.insertAddresses(sortedAndParsedUsers)
  }

  replaceDates(sortedParsedEvents: SortedEvents, blockInfos: Map<number, number>) {
    Object.values(sortedParsedEvents).forEach((v) => {
      v.forEach((event) => {
        event.block_date = new Date(blockInfos.get(event.block_id)! * 1_000)
      })
    })

    return { sortedParsedEvents }
  }

  sortPointsActionsLogs(logs: Log[]) {
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
