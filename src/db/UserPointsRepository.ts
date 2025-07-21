import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository"

export class UserPointsRepository extends AbstractRepository {
  updateTask = async (
    openTask: {
      id: bigint
      task_id: bigint
      user_address: string
      start: Date | null
      closed: Date | null
      amount: string
    },
    event: Prisma.transfert_eventsUncheckedCreateInput
  ) => {
    await this.prismaClient.user_tasks.update({
      where: { id: openTask.id },
      data: { closed: event.block_date },
    })
  }

  createTask = async (
    task: {
      id: bigint
      token: {
        symbol: string | null
        id: bigint
        name: string | null
        address: string
      }
    },
    user: string,
    event: Prisma.transfert_eventsUncheckedCreateInput,
    amount: string
  ) => {
    await this.prismaClient.user_tasks.create({
      data: {
        task_id: task.id,
        user_address: user,
        start: event.block_date, // Chain with previous closed time
        amount: amount.toString(), // Updated running balance
        closed: null,
      },
    })
  }

  returnOpenedTasks = async (
    event: Prisma.transfert_eventsUncheckedCreateInput,
    task: {
      id: bigint
      token: {
        symbol: string | null
        id: bigint
        name: string | null
        address: string
      }
    }
  ) => {
    return await this.prismaClient.user_tasks.findMany({
      where: {
        user_address: {
          in: [event.from, event.to],
        },
        task_id: task.id,
        closed: null,
      },
      orderBy: { start: "desc" },
    })
  }

  fetchTasksEventsAndAddresses = async (lastBlockId: number) => {
    const tasks = await this.prismaClient.task.findMany({
      where: { is_active: true },
      select: { id: true, token: true },
    })

    // Get all user addresses
    const userAddresses = await this.prismaClient.user_addresses.findMany({
      select: { address: true },
    })

    // Find all relevant transfer events for registered users since last processed block
    const relevantEvents = await this.prismaClient.transfert_events.findMany({
      where: {
        OR: userAddresses.map((user) => ({
          OR: [{ from: { equals: user.address.toLowerCase(), mode: "insensitive" } }, { to: { equals: user.address.toLowerCase(), mode: "insensitive" } }],
        })),
        block_id: { gt: lastBlockId },
      },
      orderBy: { block_id: "asc" }, // Process events chronologically
    })

    return { tasks, relevantEvents }
  }
  //

  getUniqueAddressesFromTransfers = async (startBlock: number, endBlock: number) => {
    const transferEvents = await this.prismaClient.transfert_events.findMany({
      where: {
        block_id: { gte: startBlock, lte: endBlock },
      },
      select: {
        from: true,
        to: true,
      },
    })

    const uniqueAddressesSet = new Set<string>()
    transferEvents.forEach((event) => {
      uniqueAddressesSet.add(event.from.toLowerCase())
      uniqueAddressesSet.add(event.to.toLowerCase())
    })

    return Array.from(uniqueAddressesSet).map((address) => ({ address }))
  }

  getERC20ToTrack = async () => {
    const tokens = await this.prismaClient.tracked_erc20.findMany({
      select: { address: true },
    })

    const transferToWatch: string[] = tokens.map((token) => token.address)

    return transferToWatch
  }

  getMaxBlockId = async (startBlock: number) => {
    const maxBlockId = await this.prismaClient.transfert_events.aggregate({
      _max: { block_id: true },
      where: { block_id: { gt: startBlock } },
    })
    return maxBlockId._max.block_id
  }

  updateLastProcessedBlock = async (blockId: number) => {
    await this.prismaClient.last_processed_block.upsert({
      where: { block_id: 0 },
      update: { block_id: blockId },
      create: { block_id: blockId },
    })
  }

  insertTransfers = async (events: any) => {
    if (events.length > 0) {
      await this.prismaClient.transfert_events.createMany({
        data: events,
      })
    }
  }

  insertAddresses = async (events: Prisma.user_addressesCreateInput[]) => {
    if (events.length > 0) {
      const uniqueAddresses = Array.from(new Map(events.map((event) => [event.address, event])).values())
      await this.prismaClient.user_addresses.createMany({
        data: uniqueAddresses,
        skipDuplicates: true,
      })
    }
  }
}
