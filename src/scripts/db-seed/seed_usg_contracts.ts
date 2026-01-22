import { PrismaClient } from "@prisma/client"
import { TransactionPrisma } from "../../type/prisma.js"
import { commonERC20 } from "@tangent/defi-resources"
import { AddressesJson } from "../../type/data.js"

export async function seedUSGContracts(prisma: PrismaClient | TransactionPrisma, addr: AddressesJson) {
  const now = new Date()
  await prisma.wrapped_stable.createMany({
    data: [
      {
        stable_name: "crvUSD",
        creation_date: now,
        is_active: true,
        stable_address: commonERC20.crvUSD.toLowerCase(),
        address: addr.wStables.wcrvUSD.toLowerCase(),
      },
      {
        stable_name: "USDe",
        creation_date: now,
        is_active: true,
        stable_address: commonERC20.USDe.toLowerCase(),
        address: addr.wStables.wUSDe.toLowerCase(),
      },
    ],
  })

  await prisma.peg_keeper.createMany({
    data: [
      {
        address: addr.lps["USG-USDC"].toLowerCase(),
        stable_name: "USDC",
        stable_address: commonERC20.USDC.toLowerCase(),
        lp_name: "USG-USDC",
        lp_address: addr.lps["USG-USDC"],
        creation_date: now,
        is_active: true,
      },
      {
        address: addr.lps["USG-frxUSD"].toLowerCase(),
        stable_name: "frxUSD",
        stable_address: commonERC20.frxUSD.toLowerCase(),
        lp_name: "USG-frxUSD",
        lp_address: addr.lps["USG-frxUSD"],
        creation_date: now,
        is_active: true,
      },
    ],
  })
}
