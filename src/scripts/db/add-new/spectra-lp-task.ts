import { Prisma, PrismaClient } from "@prisma/client"
import { JsonRpcProvider } from "ethers"
import { PTS_PER_DAY_TO_SECONDS_RATE } from "../config/config_lp_tasks.js"

const prisma = new PrismaClient()

async function main() {
  const provider = new JsonRpcProvider(process.env.CHAIN_RPCS!.split(",")[0])
  const now = new Date((await provider.getBlock("latest"))!.timestamp * 1000)

  const pt = "0x0c70be04fdb5f4df8c5ff3573624cb76676cfdc4".toLowerCase()
  const lp = "0x16fda3e759c5ff8d34198abf453a7f8f043515d5".toLowerCase()
  const yt = "0xfb4e59541e308ee1E61f608892245e5da607FA14".toLowerCase()

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const priceSources = await prisma.price_source.createManyAndReturn({
      data: [
        {
          name: "PT sUSG 20260609",
          type: "spectraApi",
          reference: pt,
          address: pt,
        },
        {
          name: "LP sUSG 20260609",
          type: "spectraApi",
          reference: pt,
          address: lp,
        },
        {
          name: "YT sUSG 20260609",
          type: "spectraApi",
          reference: pt,
          address: yt,
        },
      ],
    })

    const lpBal: Prisma.lp_taskCreateManyInput[] = [
      {
        name: "PT sUSG 2026/06/09",
        action_type: "PT",
        protocol: "Spectra",
        token_address: pt,
        point_rate: PTS_PER_DAY_TO_SECONDS_RATE[5],
        description: "Hold spectra PT of sUSG",
        url: "https://app.spectra.finance/fixed-rate/eth:0x16fda3e759c5ff8d34198abf453a7f8f043515d5",
        start_date: now,
        price_source_id: priceSources[0].id,
        can_zap: false,
      },
      {
        name: "LP sUSG 2026/06/09",
        action_type: "LP",
        protocol: "Spectra",
        token_address: lp,
        point_rate: PTS_PER_DAY_TO_SECONDS_RATE[15],
        description: "Hold spectra LP of sUSG",
        url: "https://app.spectra.finance/pools/eth:0x16fda3e759c5ff8d34198abf453a7f8f043515d5",
        start_date: now,
        price_source_id: priceSources[1].id,
        can_zap: false,
      },
      {
        name: "YT sUSG 2026/06/09",
        action_type: "YT",
        protocol: "Spectra",
        token_address: yt,
        point_rate: PTS_PER_DAY_TO_SECONDS_RATE[15],
        description: "Hold spectra YT of sUSG",
        url: "https://app.spectra.finance/trade-yield/eth:0x16fda3e759c5ff8d34198abf453a7f8f043515d5",
        start_date: now,
        price_source_id: priceSources[2].id,
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
      data: [lp, pt, yt].map((uE) => ({ user: uE })),
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
