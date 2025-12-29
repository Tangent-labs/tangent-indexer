import { PrismaClient } from "@prisma/client"
import { AddressesJson } from "../../type/data.js"
import { TransactionPrisma } from "../../type/prisma.js"
import { parseEther } from "ethers"

const user0 = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
const user1 = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8"

export async function seedPredeposit(prisma: PrismaClient | TransactionPrisma, addresses: AddressesJson) {
  const lps = await prisma.usg_lp_keys.createManyAndReturn({
    data: [
      { lp_name: "USG-USDC", lp_address: addresses.lps["USG-USDC"].toLowerCase() },
      { lp_name: "USG-frxUSD", lp_address: addresses.lps["USG-frxUSD"].toLowerCase() },
    ],
  })

  await prisma.accounted_total.createMany({
    data: [
      { usg_lp_id: lps[0].id, cap_lp: parseEther((5_000_000).toString()).toString(), total_lp: "0" },
      { usg_lp_id: lps[1].id, cap_lp: parseEther((1_500_000).toString()).toString(), total_lp: "0" },
    ],
  })

  await prisma.predeposit_users.createMany({
    data: [
      { user_address: user0, is_private: false, signature: "Zaza" },
      { user_address: user1, is_private: true, signature: "Zaza" },
    ],
  })

  await prisma.predeposit_state.create({
    data: { state: "deposit_private" },
  })
}
