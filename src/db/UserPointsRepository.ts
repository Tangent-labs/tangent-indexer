import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository"

export class UserPointsRepository extends AbstractRepository {
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

      const openTasks = await this.prismaClient.user_tasks.findMany({
        where: {
          user_address: {
            in: [event.from, event.to],
          },
          task_id: task.id,
          closed: null,
        },
        orderBy: { start: "desc" },
      })

      // Process open tasks for each user
      for (const openTask of openTasks) {
        const userAddress = openTask.user_address
        const isFromUser = userAddress.toLowerCase() === event.from?.toLowerCase()

        // Close the existing task and open a new one
        const newAmount = isFromUser ? Number(openTask.amount) - Number(event.amount) : Number(openTask.amount) + Number(event.amount)

        await this.prismaClient.user_tasks.update({
          where: { id: openTask.id },
          data: { closed: event.block_date },
        })

        if (newAmount > 0.01) {
          await this.prismaClient.user_tasks.create({
            data: {
              task_id: task.id,
              user_address: userAddress,
              start: event.block_date, // Chain with previous closed time
              amount: newAmount.toString(), // Updated running balance
              closed: null,
            },
          })
        }
      }

      // Handle cases where no open task exists for a user
      for (const userAddress of [event.from, event.to]) {
        const hasOpenTask = openTasks.some((task) => task.user_address.toLowerCase() === userAddress.toLowerCase())
        if (!hasOpenTask) {
          await this.prismaClient.user_tasks.create({
            data: {
              task_id: task.id,
              user_address: userAddress,
              start: event.block_date,
              amount: event.amount,
              closed: null,
            },
          })
        }
      }
    }
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
