import { PrismaClient } from "@prisma/client"
import * as dotenv from "dotenv"

dotenv.config()

const prisma = new PrismaClient()

async function main() {
  const market = await prisma.usg_markets.findFirst({
    where: { is_active: true },
    orderBy: { id: "asc" },
  })

  if (!market) {
    throw new Error("No active market found. Seed the database before running monitoring mocks.")
  }

  let monitoredToken = await prisma.peg_monitored_tokens.findFirst({
    where: { active: true },
    orderBy: { id: "asc" },
  })

  if (!monitoredToken) {
    monitoredToken = await prisma.peg_monitored_tokens.create({
      data: {
        symbol: "MOCKUSD",
        address: "0x00000000000000000000000000000000000000aa",
        peg_type: "USD",
        active: true,
      },
    })
  }

  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const borrowerAddress = "0x0000000000000000000000000000000000000bad"

  await prisma.$transaction(async (tx) => {
    await tx.peg_sanity_snapshots.create({
      data: {
        token_id: monitoredToken.id,
        price: 0.94,
        ref_price: 1.0,
        deviation_pct: 6.0,
        timestamp: now,
      },
    })

    await tx.oracle_sanity_snapshots.create({
      data: {
        market_id: market.id,
        oracle_price: 0.94,
        offchain_price: 1.0,
        deviation_pct: 6.0,
        timestamp: now,
      },
    })

    await tx.usg_global_history.createMany({
      data: [
        {
          date: twentyFourHoursAgo,
          tvl_markets: 200,
          tvl_susg: 0,
          tvl_wstables: 0,
          tvl_peg_keepers: 0,
          total_tvl: 200,
          total_debt: 100,
        },
        {
          date: oneHourAgo,
          tvl_markets: 120,
          tvl_susg: 0,
          tvl_wstables: 0,
          tvl_peg_keepers: 0,
          total_tvl: 120,
          total_debt: 100,
        },
        {
          date: now,
          tvl_markets: 80,
          tvl_susg: 0,
          tvl_wstables: 0,
          tvl_peg_keepers: 0,
          total_tvl: 80,
          total_debt: 100,
        },
      ],
    })

    await tx.market_config.deleteMany({
      where: { market_id: market.id },
    })

    await tx.market_config.create({
      data: {
        market_id: market.id,
        max_ltv: 0.75,
        liquidation_threshold: 0.8,
        max_debt: 1_000_000,
        last_update: now,
      },
    })

    await tx.position_snapshots.create({
      data: {
        market_id: market.id,
        borrower_address: borrowerAddress,
        collateral_balance: 1000,
        position_value_usd: 1000,
        user_debt: 800,
        ltv: 0.8,
        cr: 1.28,
        margin: 0,
        health_ratio: 1.01,
        liquidation_price: 0.98,
        distance_pct: 0.4,
        snapshot_timestamp: now,
      },
    })
  })

  console.log("Monitoring mock data inserted.")
  console.log(`Market: ${market.contract_name} (${market.contract_address})`)
  console.log(`Peg token: ${monitoredToken.symbol} (${monitoredToken.address})`)
  console.log(`Borrower: ${borrowerAddress}`)
  console.log("Expected alerts: PEG, ORACLE_SANITY, TVL 1H/24H, COLLATERALIZATION, LIQUIDATION_DISTANCE")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
