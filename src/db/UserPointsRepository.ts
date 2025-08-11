import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository"

export class UserPointsRepository extends AbstractRepository {
  getOpenedTasks = async (userAddresses: Array<string>, taskIds: Array<bigint>) => {
    return this.prismaClient.user_tasks.findMany({
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
    if (tasksToClose.length > 0) {
      const caseClauses = tasksToClose
        .map(({ id, closed }) => {
          const timeInSeconds = Math.floor(closed.getTime() / 1000)
          return `WHEN ${id.toString()} THEN (to_timestamp(${timeInSeconds}) AT TIME ZONE 'UTC')`
        })
        .join(" ")

      const ids = tasksToClose.map(({ id }) => id.toString()).join(",")

      const sql = `
    UPDATE "points"."user_tasks"
    SET "closed" = CASE "id"
      ${caseClauses}
      ELSE "closed"
    END
    WHERE "id" IN (${ids});
  `

      await (this.prismaClient as Prisma.TransactionClient).$executeRawUnsafe(sql)
    }

    if (tasksToCreate.length > 0) {
      await (this.prismaClient as Prisma.TransactionClient).user_tasks.createMany({
        data: tasksToCreate,
        skipDuplicates: false,
      })
    }
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
