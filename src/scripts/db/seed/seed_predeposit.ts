import { PrismaClient } from "@prisma/client"
import { parseEther } from "ethers"
import { AddressesJson } from "../../../type/data.js"
import { TransactionPrisma } from "../../../type/prisma.js"

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
      { usg_lp_id: lps[1].id, cap_lp: parseEther((5_000_000).toString()).toString(), total_lp: "0" },
    ],
  })

  await prisma.predeposit_users.createMany({
    data: [
      { user_address: "0xAAc0aa431c237C2C0B5f041c8e59B3f1a43aC78F".toLowerCase(), is_private: true },
      { user_address: "0xC1415496475d70Cfe84D5360864F8A89e7b6CF28".toLowerCase(), is_private: true },
      { user_address: "0x06232028c253dA3404cce43A4789dc802a62C846".toLowerCase(), is_private: true },
      { user_address: "0x3689c216f8f6ce7e2CE2a27c81a23096A787F532".toLowerCase(), is_private: true },
      { user_address: "0x4334703b0b74e2045926f82f4158a103fce1df4f".toLowerCase(), is_private: true },
      { user_address: "0x505FB4560914eA9c3af22b75ca55c3881472ae45".toLowerCase(), is_private: true },
      { user_address: "0x0edEFA91e99da1eDDD1372c1743A63B1595fC413".toLowerCase(), is_private: true },
      { user_address: "0x64129410B4Ae43c13D79537f114E3B46F97Ac92a".toLowerCase(), is_private: true },
    ],
  })

  await prisma.predeposit_state.create({
    data: { state: "deposit_private" },
  })
}
