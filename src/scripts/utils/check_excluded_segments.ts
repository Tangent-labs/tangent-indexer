import * as dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"
import { formatUnits } from "ethers"

dotenv.config()

const prisma = new PrismaClient()

/**
 * @notice Finds open lp_user_tasks segments belonging to addresses in lp_points_users_excluded.
 * @dev Read-only. Every row it reports is an active points leak.
 *
 * Exclusion is enforced in exactly one place — UserPointsService, when segments are built — and
 * nowhere in the points SQL. get_user_points_details reads lp_user_tasks joined to lp_task and
 * never consults lp_points_users_excluded, so an open segment earns points regardless of whether
 * its owner is excluded.
 *
 * That makes these segments permanent: being excluded is precisely what stops UserPointsService
 * from ever processing a transfer for that address, so nothing will ever set closed_date. Only a
 * manual UPDATE clears them.
 *
 * This happens whenever an address is excluded *after* it already holds a segment — e.g. an
 * exclusion added to a live task, or a task seeded before its exclusion list was complete.
 *
 * Usage:
 *   npm run tangent:check-excluded-segments
 */

async function main() {
  const excluded = await prisma.lp_points_users_excluded.findMany({ select: { user: true } })
  const excludedAddresses = [...new Set(excluded.map((e) => e.user.toLowerCase()))]

  console.log(`excluded addresses : ${excludedAddresses.length}`)

  if (excludedAddresses.length === 0) {
    console.log("\nNothing excluded — nothing to leak.")
    return
  }

  const leaking = await prisma.lp_user_tasks.findMany({
    where: {
      closed_date: null,
      user_address: { in: excludedAddresses, mode: "insensitive" },
    },
    include: { lp_task: { select: { id: true, name: true, protocol: true, action_type: true } } },
    orderBy: { start_date: "asc" },
  })

  if (leaking.length === 0) {
    console.log("\n✓ No open segments belong to an excluded address.")
    return
  }

  console.log(`\n✗ ${leaking.length} open segment(s) belong to an excluded address and are earning points:\n`)

  for (const segment of leaking) {
    const task = segment.lp_task
    console.log(`  task ${task.id} ${task.protocol}/${task.name} (${task.action_type})`)
    console.log(`    user       : ${segment.user_address}`)
    console.log(`    amount     : ${formatUnits(segment.amount || "0", 18)}`)
    console.log(`    open since : ${segment.start_date.toISOString()}`)
    console.log(`    segment id : ${segment.id}`)
    console.log("")
  }

  console.log("These will not close on their own: the exclusion is what prevents UserPointsService")
  console.log("from processing transfers for these addresses, so closed_date stays null forever.")
  console.log("Clearing them means an explicit UPDATE on closed_date, plus deciding what to do")
  console.log("about the points already awarded in lp_user_points.")

  process.exitCode = 1
}

main()
  .catch((error) => {
    console.error("Failed to execute:", (error as Error).message)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
