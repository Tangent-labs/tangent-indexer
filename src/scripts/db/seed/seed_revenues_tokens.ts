// Seeds the revenues_tokens table with the reward tokens tracked for market revenues (CRV, CVX, PYUSD, RLUSD, FXN, BOLD).
import { PrismaClient } from "@prisma/client"
import { COMMON_ERC20S } from "@tangent/defi-resources"

const prisma = new PrismaClient()
export async function seedRevenuesTokens() {
  await prisma.revenues_tokens.createMany({
    data: [
      { name: "CRV", address: COMMON_ERC20S.CRV.toLowerCase(), decimals: 18 },
      { name: "CVX", address: COMMON_ERC20S.CVX.toLowerCase(), decimals: 18 },
      { name: "PYUSD", address: COMMON_ERC20S.PYUSD.toLowerCase(), decimals: 6 },
      { name: "RLUSD", address: COMMON_ERC20S.RLUSD.toLowerCase(), decimals: 18 },
      { name: "FXN", address: COMMON_ERC20S.FXN.toLowerCase(), decimals: 18 },
      { name: "BOLD", address: COMMON_ERC20S.BOLD.toLowerCase(), decimals: 18 },
    ],
    skipDuplicates: true,
  })
}
seedRevenuesTokens()
