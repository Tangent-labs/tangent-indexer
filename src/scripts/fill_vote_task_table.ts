// seed_vote_tasks.ts (one-off seed)
import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()

async function main() {
  await prisma.vote_task.createMany({
    data: [
      {
        name: "VOTE_01",
        organisation: "cvx.eth",
        protocol: "Convex",
        point_rate: 1,
        description: "Convex rewarded choice vote",
        url: "https://vote.convexfinance.com/",
        is_onchain: false,
      },
      {
        name: "VOTE_02",
        organisation: "cvx.eth",
        protocol: "Convex",
        point_rate: 1,
        description: "Convex rewarded choice vote",
        url: "https://vote.convexfinance.com/",
        is_onchain: false,
      },
      {
        // sdCRV weekly “rewarded choice” votes (sdcrv.eth)
        name: "VOTE_03",
        organisation: "sdcrv.eth",
        protocol: "Curve",
        point_rate: 2,
        description: "sdCRV rewarded choice vote",
        url: "https://snapshot.box/#/s:sdcrv.eth",
        is_onchain: false,
      },
      {
        // Optional: participation reward once per proposal (any org)
        name: "VOTE_PARTICIPATION",
        organisation: "*",
        protocol: "Generic",
        point_rate: 10,
        description: "Flat reward for participating in a proposal (once per proposal)",
        url: "https://hub.snapshot.org",
        is_onchain: false,
      },
    ],
    skipDuplicates: true,
  })
  console.log("vote_task seeded")
}
main().finally(() => prisma.$disconnect())
