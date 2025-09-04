// seed_vote_tasks.ts (one-off seed)
import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()

async function main() {
  await prisma.vote_task.createMany({
    data: [
      {
        name: "VOTE_01",
        action_type: "snapshot_vote",
        organisation: "cvx.eth",
        protocol: "Convex",
        point_rate: 1,
        unit: "vote",
        description: "Convex rewarded choice vote",
        url: "https://vote.convexfinance.com/",
        is_active: true,
      },
      {
        name: "VOTE_02",
        action_type: "snapshot_vote",
        organisation: "cvx.eth",
        protocol: "Convex",
        point_rate: 1,
        unit: "vote",
        description: "Convex rewarded choice vote",
        url: "https://vote.convexfinance.com/",
        is_active: true,
      },
      {
        // sdCRV weekly “rewarded choice” votes (sdcrv.eth)
        name: "VOTE_03",
        action_type: "snapshot_vote",
        organisation: "sdcrv.eth",
        protocol: "Curve",
        point_rate: 2,
        unit: "vote",
        description: "sdCRV rewarded choice vote",
        url: "https://snapshot.box/#/s:sdcrv.eth",
        is_active: true,
      },
      {
        // Optional: participation reward once per proposal (any org)
        name: "VOTE_PARTICIPATION",
        action_type: "snapshot_vote",
        organisation: "*",
        protocol: "Generic",
        point_rate: 10,
        unit: "vote",
        description: "Flat reward for participating in a proposal (once per proposal)",
        url: "https://hub.snapshot.org",
        is_active: true,
      },
    ],
    skipDuplicates: true,
  })
  console.log("vote_task seeded")
}
main().finally(() => prisma.$disconnect())
