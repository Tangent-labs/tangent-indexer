import { Prisma, PrismaClient } from "@prisma/client"
import { JsonRpcProvider } from "ethers"
import { PTS_PER_DAY_TO_SECONDS_RATE } from "../config/config_lp_tasks.js"

const prisma = new PrismaClient()

const USG_sDOLA_LP = "0x317837aed98bea887074d1f97fd3c83ebca6905b"

async function main() {
  const provider = new JsonRpcProvider(process.env.CHAIN_RPCS!.split(",")[0])
  const now = new Date((await provider.getBlock("latest"))!.timestamp * 1000)

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const [priceSource] = await tx.price_source.createManyAndReturn({
      data: [
        {
          name: "USG_sDOLA",
          type: "curveApi",
          reference: "factory-stable-ng",
          address: USG_sDOLA_LP.toLowerCase(),
        },
      ],
    })

    const lpTask: Prisma.lp_taskCreateManyInput = {
      name: "USG-sDOLA",
      action_type: "LP",
      protocol: "Curve",
      token_address: USG_sDOLA_LP.toLowerCase(),
      point_rate: PTS_PER_DAY_TO_SECONDS_RATE[125],
      description: "Hold Curve USG/sDOLA LP tokens",
      url: `https://www.curve.finance/dex/ethereum/pools/${USG_sDOLA_LP}/deposit`,
      price_source_id: priceSource.id!,
      start_date: now,
      can_zap: true,
    }

    await tx.tracked_erc20.createMany({
      data: [
        {
          address: lpTask.token_address,
          name: `${lpTask.name} ${lpTask.protocol}`,
          symbol: `${lpTask.name} ${lpTask.protocol}`,
        },
      ],
    })

    await tx.lp_task.createMany({
      data: [lpTask],
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
