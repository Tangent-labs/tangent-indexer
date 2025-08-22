import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository"
import { JsonRpcProvider } from "ethers"

export class UserPointsRepository extends AbstractRepository {
  /**
   *
   * @param tasksWithBoosts user_tasks with boost, average token price and time range
   * ready for points computation
   * Applied formula is tokenAmount * price * timeRange * pointRate * boost
   * @returns
   */
  computePointsForTasks = async (
    tasksWithBoosts: {
      boostMultiplier: string
      avgPriceUsd: string | null
      timeRangeSeconds: number
      id: bigint
      task_id: bigint
      user_address: string
      start: Date
      closed: Date | null
      amount: string
    }[]
  ) => {
    if (tasksWithBoosts.length === 0) return []

    // Fetch point_rate and unit for all task_ids in one query
    const taskMeta = await this.prismaClient.task.findMany({
      where: { id: { in: tasksWithBoosts.map((t) => t.task_id) } },
      select: { id: true, point_rate: true, unit: true },
    })
    const taskMetaMap = new Map(taskMeta.map((t) => [t.id, t]))

    return tasksWithBoosts.map((task) => {
      const meta = taskMetaMap.get(task.task_id)
      if (!meta) throw new Error(`No task meta found for id ${task.task_id}`)

      const unitSeconds = meta.unit === "hour" ? 3600 : meta.unit === "day" ? 86400 : meta.unit === "second" ? 1 : 1

      const amountTokens = Number(task.amount) / 1e18
      const avgPrice = Number(task.avgPriceUsd) / 1e18
      const boost = Number(task.boostMultiplier)

      const points = amountTokens * avgPrice * (task.timeRangeSeconds / unitSeconds) * meta.point_rate * boost

      return {
        ...task,
        points: Math.round(points),
      }
    })
  }

  /**
   *
   * @param upgradedTasks user_tasks with average token price and time range
   * @param startBlockId use start block to fetch the most accurate user boost
   * @returns
   */
  computeClosestBoostForTasks = async (
    upgradedTasks: {
      avgPriceUsd: string | null
      timeRangeSeconds: number
      id: bigint
      task_id: bigint
      user_address: string
      start: Date
      closed: Date | null
      amount: string
    }[],
    startBlockId: number | bigint
  ) => {
    if (upgradedTasks.length === 0) return []

    // 1) Resolve the block timestamp (use nearest <= just in case)
    const block = await this.prismaClient.global_blocks.findFirst({
      where: { block_id: { lte: BigInt(startBlockId) } },
      orderBy: { block_id: "desc" },
      select: { created_at: true },
    })
    if (!block?.created_at) {
      // No block time: default multiplier 1.00
      return upgradedTasks.map((t) => ({ ...t, boostMultiplier: "1.00" }))
    }

    // 2) Build VALUES(...) list for (id, user_address)
    //    We’ll lowercase addresses to be safe/consistent.
    const valuesRows = upgradedTasks.map((t) => `(${t.id.toString()}, '${t.user_address.toLowerCase()}')`).join(",")

    // 3) Single SQL: for each input row (task id + user), pick closest user_boost to block_time
    const sql = `
    WITH input(id, user_address) AS (
      VALUES ${valuesRows}
    ),
    blk AS (
      SELECT ${Math.floor(block.created_at.getTime() / 1000)}::bigint AS epoch_s
    )
    SELECT i.id::bigint,
           COALESCE(ub.multiplier::text, '1.00') AS multiplier
    FROM input i
    CROSS JOIN blk
    LEFT JOIN LATERAL (
      SELECT multiplier
      FROM points.user_boost ub
      WHERE LOWER(ub.user_address) = i.user_address
      ORDER BY ABS(EXTRACT(EPOCH FROM ub.start_at) - blk.epoch_s)
      LIMIT 1
    ) ub ON true;
  `

    // 4) Execute and map back
    const rows: { id: bigint; multiplier: string }[] = await this.prismaClient.$queryRawUnsafe(sql)

    const boostByTaskId = new Map<bigint, string>(rows.map((r) => [r.id, r.multiplier]))

    return upgradedTasks.map((t) => ({
      ...t,
      boostMultiplier: boostByTaskId.get(t.id) ?? "1.00",
    }))
  }

  /**
   *
   * @param upgradedTasks user_tasks with time range
   * Fetching user taks token price by taking the average price between start and close timestamps
   * @returns
   */
  computeTokenPriceForTask = async (
    upgradedTasks: {
      timeRangeSeconds: number
      id: bigint
      task_id: bigint
      user_address: string
      start: Date
      closed: Date | null
      amount: string
    }[]
  ) => {
    if (upgradedTasks.length === 0) return []

    const ids = upgradedTasks.map((t) => t.id).join(",")

    const sql = `
    WITH midpoints AS (
      SELECT 
        ut.id,
        t.token_address,
        to_timestamp(
          (
            EXTRACT(EPOCH FROM ut.start) + 
            EXTRACT(EPOCH FROM COALESCE(ut.closed, NOW()))
          ) / 2
        ) AS midpoint
      FROM points.user_tasks ut
      JOIN points.task t ON ut.task_id = t.id
      WHERE ut.id IN (${ids})
    )
    SELECT m.id,
           pf.price_usd
    FROM midpoints m
    JOIN LATERAL (
      SELECT pf.price_usd
      FROM points.price_feeds pf
      WHERE pf.token = m.token_address
      ORDER BY ABS(EXTRACT(EPOCH FROM pf.timestamp) - EXTRACT(EPOCH FROM m.midpoint))
      LIMIT 1
    ) pf ON true;
  `

    const avgPrices: { id: bigint; price_usd: string }[] = await this.prismaClient.$queryRawUnsafe(sql)

    const avgPriceMap = new Map<bigint, string>(avgPrices.map((row) => [row.id, row.price_usd]))

    return upgradedTasks.map((task) => ({
      ...task,
      avgPriceUsd: avgPriceMap.get(task.id) || null,
    }))
  }

  /**
   *
   * @param blockId Fetch all tasks which need time range computation starting at blockId
   * @param provider best provider
   * @returns
   */
  fetchTasksToComputeRangeFor = async (blockId: number, provider: JsonRpcProvider) => {
    const userPointsCount = await this.prismaClient.user_points.count()
    const isFreshDB = userPointsCount === 0

    let referenceDate = new Date(0)

    if (!isFreshDB) {
      const latestIndexedBlock = await this.prismaClient.global_blocks.findFirst({
        where: { block_id: { lte: BigInt(blockId) } },
        orderBy: { block_id: "desc" },
        select: { block_id: true },
      })

      if (latestIndexedBlock) {
        const referenceBlock = await provider.getBlock(Number(latestIndexedBlock.block_id))
        if (!referenceBlock) throw new Error("RPC: reference block not found")
        referenceDate = new Date(referenceBlock.timestamp * 1000)
      }
    }

    const select = {
      id: true,
      task_id: true,
      user_address: true,
      amount: true,
      start: true,
      closed: true,
    } as const

    if (isFreshDB) {
      // FULL mode → grab all user_tasks
      return this.prismaClient.user_tasks.findMany({
        select,
        orderBy: { start: "desc" },
      })
    }

    // INCREMENTAL mode → open tasks or closed after on-chain reference time
    return this.prismaClient.user_tasks.findMany({
      where: {
        OR: [
          { closed: null }, // still open
          { closed: { gt: referenceDate } }, // closed after reference block time
        ],
      },
      select,
      orderBy: { start: "desc" },
    })
  }

  // Helper: block time at or before startBlock
  getBlockTimeAtOrBefore = async (blockId: number | bigint) => {
    const row = await this.prismaClient.global_blocks.findFirst({
      where: { block_id: { lte: BigInt(blockId) } },
      orderBy: { block_id: "desc" },
      select: { created_at: true },
    })
    return row?.created_at ?? new Date(0)
  }

  /**
   *
   * @param batch Looks up the previously stored points
   * Computes the bonus delta for each task
   * Maps each child in deltas to its referrer via referral_usages.
   * Aggregates and inserts bonus points
   * AND ONLY THEN
   * Insert base points (order matters a lot here)
   * @param startBlockTimestampInSeconds checks eligible bonuses
   * @returns
   */
  upsertUserPointsAndReferralPoints = async (
    batch: {
      user_task_id: bigint
      task_id: bigint
      child_address: string
      new_points: number
    }[],
    startBlockTimestampInSeconds: number
  ) => {
    if (!batch?.length) return

    const queryValues = batch.map((b) => `(${b.user_task_id},'${b.child_address}',${b.task_id},${b.new_points})`).join(",")

    const referralBonusPoints = `
      WITH input(user_task_id, child_address, task_id, new_points) AS (VALUES ${queryValues}),
      prior AS (
        SELECT i.user_task_id,
               i.child_address,
               i.task_id,
               i.new_points,
               COALESCE(up.points, 0) AS old_points
        FROM input i
        LEFT JOIN "points"."user_points" up
          ON up.user_task_id = i.user_task_id
      ),
      deltas AS (
        SELECT
          p.user_task_id,
          p.child_address,
          GREATEST(FLOOR(p.new_points * 0.10) - FLOOR(p.old_points * 0.10), 0)::bigint AS ref_delta
        FROM prior p
        WHERE GREATEST(FLOOR(p.new_points * 0.10) - FLOOR(p.old_points * 0.10), 0) > 0
      ),
      eligible AS (
        SELECT
          ru.godfather_id AS referrer_id,
          d.ref_delta
        FROM deltas d
        JOIN "global"."user" child
          ON child.address = d.child_address
        JOIN "global"."referral_usages" ru
          ON ru.godson_id = child.id
        WHERE ru.used_at <= to_timestamp(${startBlockTimestampInSeconds})
      ),
      agg AS (
        SELECT referrer_id, SUM(ref_delta)::bigint AS delta_sum
        FROM eligible
        GROUP BY referrer_id
      )
      UPDATE "global"."user" u
      SET referral_points = u.referral_points + a.delta_sum
      FROM agg a
      WHERE u.id = a.referrer_id;
    `
    await (this.prismaClient as Prisma.TransactionClient).$executeRawUnsafe(referralBonusPoints)

    const userPoints = `
      WITH input(user_task_id, child_address, task_id, new_points) AS (VALUES ${queryValues})
      INSERT INTO "points"."user_points" ("user_address","task_id","user_task_id","points")
      SELECT child_address, task_id, user_task_id, new_points
      FROM input
      ON CONFLICT ("user_task_id")
      DO UPDATE SET "points" = EXCLUDED."points";
    `
    await (this.prismaClient as Prisma.TransactionClient).$executeRawUnsafe(userPoints)
  }

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
