import { Prisma } from "@prisma/client"
import { JsonRpcProvider } from "ethers"
import { AbstractRepository } from "../AbstractRepository.js"
export type DebtModifyingEvent = { account: string; market_id: string; debt_shares: string; block_id: number; block_date: Date }

export class UserPointsLPRepository extends AbstractRepository {
  // Helper: block time at or before startBlock
  getBlockTimeAtOrBefore = async (blockId: number, provider: JsonRpcProvider) => {
    const latestIndexedBlock = await this.prismaClient.votes_points_blocks.findFirst({
      where: { block_id: { lte: BigInt(blockId) } },
      orderBy: { block_id: "desc" },
      select: { block_id: true },
    })

    if (latestIndexedBlock) {
      const referenceBlock = await provider.getBlock(Number(latestIndexedBlock.block_id))
      if (!referenceBlock) throw new Error("RPC: reference block not found")
      return referenceBlock.timestamp
    }

    return 0
  }

  getOpenedTasks = async (userAddresses: string[], taskIds: bigint[]) => {
    return await this.prismaClient.lp_user_tasks.findMany({
      where: {
        user_address: {
          in: userAddresses,
          mode: "insensitive", // TODO, we need to remove this to don't break the index
        },
        task_id: {
          in: taskIds,
        },
        closed_date: null,
      },
      select: {
        id: true,
        task_id: true,
        user_address: true,
        amount: true,
        start_date: true,
        closed_date: true,
      },
      orderBy: { start_date: "desc" },
    })
  }

  updateProcessedTasks = async (tasksToClose: { id: bigint; closed_date: Date }[], tasksToCreate: Prisma.lp_user_tasksUncheckedCreateInput[]) => {
    if (tasksToClose.length) {
      const queryParam = tasksToClose.map((t) => `(${t.id}::bigint, '${t.closed_date.toISOString()}'::timestamptz AT TIME ZONE 'UTC')`)

      await (this.prismaClient as Prisma.TransactionClient).$executeRawUnsafe(`
        UPDATE points.lp_user_tasks ut
        SET closed_date = v.closed_date
        FROM (VALUES
          ${queryParam.join(",")}
        ) AS v(id, closed_date)
        WHERE ut.id = v.id;
      `)
    }

    if (tasksToCreate.length > 0) {
      await (this.prismaClient as Prisma.TransactionClient).lp_user_tasks.createMany({
        data: tasksToCreate,
        skipDuplicates: false,
      })
    }
  }

  fetchTasksEventsAndAddresses = async (startBlock: number, endBlock: number, blockDates: Map<number, number>) => {
    const result = await this.prismaClient.lp_task.findMany({
      where: {
        start_date: { lte: new Date(blockDates.get(endBlock)! * 1000) },
        OR: [{ end_date: { gte: new Date(blockDates.get(startBlock)! * 1000) } }, { end_date: null }],
      },
      select: {
        id: true,
        token: {
          select: {
            address: true,
            transfer_events: {
              where: {
                block_id: { gt: startBlock, lte: endBlock },
              },
              // prevents mismatch when replaying the indexer
              orderBy: [{ block_id: "asc" }, { id: "asc" }],
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

    return { tasks, transferEvents: relevantEvents }
  }

  async getAddressesExcludedFromLpPoints() {
    return await this.prismaClient.lp_points_users_excluded.findMany({
      select: {
        user: true,
      },
    })
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

  async insertTransfers(events: Prisma.transfer_eventsCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.transfer_events.createMany({
        data: events,
      })
    }
  }

  async insertAddLiquidity(events: Prisma.add_liquidity_eventsCreateManyInput[]) {
    if (events.length > 0) {
      await this.prismaClient.add_liquidity_events.createMany({
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

  async insertLpTasks(lpTasks: Prisma.lp_taskCreateManyInput[]) {
    if (lpTasks.length > 0) {
      await this.prismaClient.lp_task.createMany({
        data: lpTasks,
        skipDuplicates: true,
      })
    }
  }

  async computeUserPoints(startDate: number, endDate: number) {
    // update user points
    // see: src/sql-procedure/compute_user_points.sql
    await this.prismaClient.$executeRawUnsafe(
      `SELECT points.compute_user_points( 
        (to_timestamp(${startDate}) AT TIME ZONE 'UTC')::timestamp, 
        (to_timestamp(${endDate}) AT TIME ZONE 'UTC')::timestamp
       )`
    )
  }
}
