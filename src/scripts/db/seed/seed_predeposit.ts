import { PrismaClient } from "@prisma/client"
import { JsonRpcProvider, parseEther } from "ethers"
import { AddressesJson } from "../../../type/data.js"
import { TransactionPrisma } from "../../../type/prisma.js"
import { fetchLpCoins } from "../../../utils/lpCoins.js"

export async function seedPredeposit(prisma: PrismaClient | TransactionPrisma, addresses: AddressesJson, provider: JsonRpcProvider) {
  const usgUsdc = addresses.lps["USG-USDC"].toLowerCase()
  const usgFrxUsd = addresses.lps["USG-frxUSD"].toLowerCase()

  // The coin order is fixed at pool creation, it drives which side of an LP event is USG
  // and which decimals each amount uses, so it is read on chain rather than assumed
  const [usgUsdcCoins, usgFrxUsdCoins] = await Promise.all([fetchLpCoins(provider, usgUsdc), fetchLpCoins(provider, usgFrxUsd)])

  const lps = await prisma.usg_lp_keys.createManyAndReturn({
    data: [
      {
        lp_name: "USG-USDC",
        lp_address: usgUsdc,
        token_0: usgUsdcCoins.token0,
        token_0_decimals: usgUsdcCoins.token0Decimals,
        token_1: usgUsdcCoins.token1,
        token_1_decimals: usgUsdcCoins.token1Decimals,
      },
      {
        lp_name: "USG-frxUSD",
        lp_address: usgFrxUsd,
        token_0: usgFrxUsdCoins.token0,
        token_0_decimals: usgFrxUsdCoins.token0Decimals,
        token_1: usgFrxUsdCoins.token1,
        token_1_decimals: usgFrxUsdCoins.token1Decimals,
      },
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
