import { PrismaClient } from "@prisma/client"
import { AddressesJson } from "src/type/data.js"
import { TransactionPrisma } from "src/type/prisma.js"

export async function seedUsgLpKeys(prisma: PrismaClient | TransactionPrisma, addresses: AddressesJson) {
  await prisma.usg_lp_keys.createMany({
    data: [
      { lp_name: "USG-USDC", token_address: addresses.lps["USG-USDC"].toLowerCase() },
      { lp_name: "USG-frxUSD", token_address: addresses.lps["USG-frxUSD"].toLowerCase() },
    ],
  })
}
