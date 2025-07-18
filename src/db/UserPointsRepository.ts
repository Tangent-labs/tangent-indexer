import { Prisma, PrismaClient } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository"

export class UserPointsRepository extends AbstractRepository {
  constructor(prismaClient: PrismaClient) {
    super(prismaClient)
  }

  processTasks = async (
    relevantEvents: Prisma.transfert_eventsCreateInput[],
    tasks: {
      token: string
      id: bigint
    }[],
    userAddresses: Prisma.user_addressesCreateInput[]
  ) => {
    for (const event of relevantEvents) {
      // Map token_address to task_id
      const task = tasks.find((t) => t.token.toLowerCase() === event.token_address.toLowerCase())
      if (!task) {
        console.warn(`No matching task for token ${event.token_address}, skipping`)
        continue
      }

      const userAddress = userAddresses.find(
        (u) => u.address.toLowerCase() === event.from.toLowerCase() || u.address.toLowerCase() === event.to.toLowerCase()
      )?.address

      if (!userAddress) {
        console.warn(`No matching user for event ${event.tx_hash}, skipping`)
        continue
      }

      const eventAmount = parseFloat(event.amount)
      if (isNaN(eventAmount)) {
        console.warn(`Invalid amount for event ${event.tx_hash}, skipping`)
        continue
      }

      // Determine if it's a deposit or withdrawal
      const isDeposit = event.from.toLowerCase() === userAddress.toLowerCase()
      const amountChange = isDeposit ? eventAmount : -eventAmount

      // Find the most recent open task for this user and task
      const openTask = await this.prismaClient.user_tasks.findFirst({
        where: {
          user_address: userAddress,
          task_id: task.id,
          closed: null,
        },
        orderBy: { start: "desc" },
        take: 1,
      })

      if (!openTask) {
        // New event: Create a new task with initial balance
        await this.prismaClient.user_tasks.create({
          data: {
            task_id: task.id,
            user_address: userAddress,
            start: event.block_date,
            amount: amountChange, // Initial balance
            closed: null,
          },
        })
        console.log(`Opened new task ${task.id} for user ${userAddress} at ${event.block_date} with amount ${amountChange}`)
      } else {
        // Close the existing task and open a new one
        const previousAmount = openTask.amount || 0
        const newAmount = previousAmount + amountChange // Running balance

        await this.prismaClient.user_tasks.update({
          where: { id: openTask.id },
          data: { closed: event.block_date },
        })

        console.log(`Closed task ${task.id} for user ${userAddress} at ${event.block_date}`)

        if (newAmount > 0.01) {
          await this.prismaClient.user_tasks.create({
            data: {
              task_id: task.id,
              user_address: userAddress,
              start: event.block_date, // Chain with previous closed time
              amount: newAmount, // Updated running balance
              closed: null,
            },
          })
          console.log(`Opened new task with amount ${newAmount}`)
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

    return { tasks, userAddresses, relevantEvents }
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

  async getMaxBlockId(startBlock: number) {
    const maxBlockId = await this.prismaClient.transfert_events.aggregate({
      _max: { block_id: true },
      where: { block_id: { gt: startBlock } },
    })
    return maxBlockId._max.block_id
  }

  async updateLastProcessedBlock(blockId: number) {
    await this.prismaClient.last_processed_block.upsert({
      where: { block_id: 0 },
      update: { block_id: blockId },
      create: { block_id: blockId },
    })
  }

  async insertTransfers(events: Prisma.transfert_eventsCreateInput[]) {
    if (events.length > 0) {
      await this.prismaClient.transfert_events.createMany({
        data: events,
      })
    }
  }

  async insertAddresses(events: Prisma.user_addressesCreateInput[]) {
    if (events.length > 0) {
      const uniqueAddresses = Array.from(new Map(events.map((event) => [event.address, event])).values())
      await this.prismaClient.user_addresses.createMany({
        data: uniqueAddresses,
        skipDuplicates: true,
      })
    }
  }
}
