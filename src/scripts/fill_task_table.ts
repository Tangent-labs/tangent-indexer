import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function seedTasks() {
  await prisma.task.createMany({
    data: [
      {
        name: "Deposit some LP on Curve",
        action_type: "LP",
        protocol: "Curve",
        token: "0x4DEcE678ceceb27446b35C672dC7d61F30bAD69E", // crvUSD-USDC Address

        point_rate: 1.5,
        unit: "hour",
        description: "Deposit liquidity provider tokens on Curve",
        url: "https://curve.fi/deposit",
        is_active: true,
      },
      {
        name: "Stake some LP on stakeDAO",
        action_type: "LP",
        protocol: "stakeDAO",
        token: "0x4DEcE678ceceb27446b35C672dC7d61F30bAD69E", // crvUSD-USDC Address
        point_rate: 2.0,
        unit: "hour",
        description: "Stake liquidity provider tokens on stakeDAO",
        url: "https://stakedao.org/stake",
        is_active: true,
      },
      {
        name: "Stake some LP on stakeDAO",
        action_type: "LP",
        protocol: "stakeDAO",
        token: "0x390f3595bCa2Df7d23783dFd126427CCeb997BF4", // crvUSD-USDT Address
        point_rate: 2.0,
        unit: "hour",
        description: "Stake liquidity provider tokens on stakeDAO",
        url: "https://stakedao.org/stake",
        is_active: true,
      },
    ],
  })

  console.log("Tasks seeded successfully")
}

seedTasks()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
