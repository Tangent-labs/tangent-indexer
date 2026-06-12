import { Prisma, PrismaClient } from "@prisma/client"
import { JsonRpcProvider } from "ethers"
import { PTS_PER_DAY_TO_SECONDS_RATE } from "../config/config_lp_tasks.js"

const prisma = new PrismaClient()

async function main() {
  const provider = new JsonRpcProvider(process.env.CHAIN_RPCS!.split(",")[0])
  const now = new Date((await provider.getBlock("latest"))!.timestamp * 1000)

  const balLP = "0xe858f8c6e0ba60fed092ac0b21681fd4cde4fa11".toLowerCase()

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const priceSources = await prisma.price_source.createManyAndReturn({
      data: [
        {
          name: "USG-GHO Balancer",
          type: "balancerApi",
          reference: null,
          address: balLP,
        },
      ],
    })
    const sID = priceSources[0].id

    const lpBal: Prisma.lp_taskCreateManyInput[] = [
      {
        name: "USG-GHO",
        action_type: "LP",
        protocol: "Balancer",
        token_address: balLP,
        point_rate: PTS_PER_DAY_TO_SECONDS_RATE[15],
        description: "Stake USG/GHO LP on Balancer",
        url: "https://balancer.fi/pools/ethereum/v3/0xe858f8c6e0ba60fed092ac0b21681fd4cde4fa11",
        start_date: now,
        price_source_id: sID,
        can_zap: false,
      },
    ]

    await tx.tracked_erc20.createMany({
      data: lpBal.map((l) => {
        return {
          address: l.token_address,
          name: `${l.name} ${l.protocol}`,
          symbol: `${l.name} ${l.protocol}`,
        }
      }),
    })

    await tx.lp_task.createMany({
      data: lpBal,
    })

    await prisma.lp_points_users_excluded.createMany({
      data: [balLP].map((uE) => ({ user: uE })),
    })
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
