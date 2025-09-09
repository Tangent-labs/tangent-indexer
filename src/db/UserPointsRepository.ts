import { Prisma, PrismaClient } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository"

export class UserPointsRepository extends AbstractRepository {
  returnOpenedTasks = async (
    event: Prisma.transfer_eventsUncheckedCreateInput,
    task: {
      id: bigint
      token: {
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

  updateTask = async (
    openTask: {
      id: bigint
      task_id: bigint
      user_address: string
      start: Date | null
      closed: Date | null
      amount: string
    },
    event: Prisma.transfer_eventsUncheckedCreateInput
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
        address: string
      }
    },
    user: string,
    event: Prisma.transfer_eventsUncheckedCreateInput,
    amount: string
  ) => {
    await this.prismaClient.user_tasks.create({
      data: {
        task_id: task.id,
        user_address: user,
        start: event.block_date,
        amount: amount.toString(),
        closed: null,
      },
    })
  }

  getOpenedTasks = async (userAddresses: Array<string>, taskIds: Array<bigint>) => {
    return await this.prismaClient.user_tasks.findMany({
      where: {
        user_address: {
          in: userAddresses,
          mode: "insensitive",
        },
        task_id: {
          in: taskIds,
        },
        closed: null,
      },
      select: {
        id: true,
        task_id: true,
        user_address: true,
        amount: true,
        start: true,
        closed: true,
      },
      orderBy: { start: "desc" },
    })
  }

  updateProcessedTasks = async (tasksToClose: { id: bigint; closed: Date }[], tasksToCreate: Prisma.user_tasksUncheckedCreateInput[]) => {
    await (this.prismaClient as PrismaClient)?.$transaction([
      ...tasksToClose.map((task) =>
        this.prismaClient.user_tasks.update({
          where: { id: task.id },
          data: { closed: task.closed },
        })
      ),
      this.prismaClient.user_tasks.createMany({
        data: tasksToCreate,
        skipDuplicates: false,
      }),
    ])
  }

  fetchTasksEventsAndAddresses = async (lastBlockId: number) => {
    const userAddresses = (
      await this.prismaClient.user.findMany({
        select: { address: true },
      })
    ).map((user) => user.address.toLowerCase())

    const result = await this.prismaClient.task.findMany({
      where: { is_active: true },
      select: {
        id: true,
        token: {
          select: {
            address: true,
            transfer_events: {
              where: {
                AND: [
                  {
                    OR: [{ from: { in: userAddresses, mode: "insensitive" } }, { to: { in: userAddresses, mode: "insensitive" } }],
                  },
                  { block_id: { gt: lastBlockId } },
                ],
              },
              orderBy: { block_id: "asc" },
            },
          },
        },
      },
    })

    const tasks = result.map((task) => ({
      id: task.id,
      token: task.token,
    }))

    const relevantEvents = result.flatMap((task) => task.token.transfer_events)

    return { tasks, relevantEvents }
  }

  getUniqueAddressesFromTransfers = async (startBlock: number, endBlock: number) => {
    const transferEvents = await this.prismaClient.transfer_events.findMany({
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

  insertTransfers = async (events: any) => {
    if (events.length > 0) {
      await this.prismaClient.transfer_events.createMany({
        data: events,
      })
    }
  }

  insertAddresses = async (addresses: Prisma.userCreateInput[]) => {
    if (addresses.length > 0) {
      await this.prismaClient.user.createMany({
        data: addresses,
        skipDuplicates: true,
      })
    }
  }
}
