// Fills usg_lp_keys.token_0 / token_1 and their decimals for pools seeded before they were recorded.
// The order is read on chain and drives which side of an LP event is USG, and which decimals
// each raw amount uses, so daily LP volume cannot be computed without it.
import * as dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"
import { JsonRpcProvider } from "ethers"

import { fetchLpCoins } from "../../../utils/lpCoins.js"

dotenv.config()

async function main() {
  const prisma = new PrismaClient()
  const provider = new JsonRpcProvider(process.env.CHAIN_RPCS!.split(",")[0])

  try {
    const lps = await prisma.usg_lp_keys.findMany()

    for (const lp of lps) {
      if (lp.token_0 && lp.token_1 && lp.token_0_decimals !== null && lp.token_1_decimals !== null) {
        console.log(`${lp.lp_name} already has its coins and decimals, skipped`)
        continue
      }

      const { token0, token0Decimals, token1, token1Decimals } = await fetchLpCoins(provider, lp.lp_address)
      await prisma.usg_lp_keys.update({
        where: { id: lp.id },
        data: { token_0: token0, token_0_decimals: token0Decimals, token_1: token1, token_1_decimals: token1Decimals },
      })
      console.log(`${lp.lp_name}: token_0 ${token0} (${token0Decimals} dec), token_1 ${token1} (${token1Decimals} dec)`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
