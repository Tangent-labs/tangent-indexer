import { PrismaClient } from "@prisma/client"
import { AddressesJson } from "../../type/data.js"
import { TransactionPrisma } from "../../type/prisma.js"
import { parseEther } from "ethers"
import { CURVE_LPS } from "@tangent/defi-resources"

const user0 = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
const user1 = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8"
const user2 = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
const user3 = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
const user4 = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"
const user6 = "0x976EA74026E726554dB657fA54763abd0C3a0aa9"
const user7 = "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955"
const user8 = "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"
const user9 = "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720"

export async function seedPredeposit(prisma: PrismaClient | TransactionPrisma, addresses: AddressesJson) {
  const lps = await prisma.usg_lp_keys.createManyAndReturn({
    data: [
      // { lp_name: "USG-USDC", lp_address: addresses.lps["USG-USDC"].toLowerCase() },
      // { lp_name: "USG-frxUSD", lp_address: addresses.lps["USG-frxUSD"].toLowerCase() },

      { lp_name: "USG-USDC", lp_address: CURVE_LPS.crvUSD_USDC.toLowerCase() },
      { lp_name: "USG-frxUSD", lp_address: CURVE_LPS.DUO_crvUSD_frxUSD.toLowerCase() },
    ],
  })

  await prisma.accounted_total.createMany({
    data: [
      { usg_lp_id: lps[0].id, cap_lp: parseEther((5_000_000).toString()).toString(), total_lp: "0" },
      { usg_lp_id: lps[1].id, cap_lp: parseEther((2_000_000).toString()).toString(), total_lp: "0" },
    ],
  })

  await prisma.predeposit_users.createMany({
    data: [
      { user_address: user0, is_private: true, signature: null },
      { user_address: user1, is_private: true, signature: "Zaza" },
      { user_address: user2, is_private: true, signature: "Zaza" },
      { user_address: user3, is_private: true, signature: "Zaza" },
      { user_address: user4, is_private: true, signature: "Zaza" },
      { user_address: user6, is_private: false, signature: "Zaza" },
      { user_address: user7, is_private: false, signature: "Zaza" },
      { user_address: user8, is_private: false, signature: "Zaza" },
      { user_address: user9, is_private: false, signature: "Zaza" },
    ],
  })

  await prisma.predeposit_state.create({
    data: { state: "deposit_private" },
  })
}
