import { PrismaClient } from "@prisma/client"
import { TransactionPrisma } from "../../../type/prisma.js"
import { COMMON_ERC20S } from "@tangent/defi-resources"

const WETH = COMMON_ERC20S.WETH.toLowerCase()
const WBTC = COMMON_ERC20S.WBTC.toLowerCase()

export async function seedPegMonitoredTokens(prisma: PrismaClient | TransactionPrisma) {
  await prisma.peg_monitored_tokens.createMany({
    data: [
      // USD stables
      { symbol: "USDC", address: COMMON_ERC20S.USDC.toLowerCase(), peg_type: "USD", ref_address: null },
      { symbol: "USDT", address: COMMON_ERC20S.USDT.toLowerCase(), peg_type: "USD", ref_address: null },
      { symbol: "PYUSD", address: COMMON_ERC20S.PYUSD.toLowerCase(), peg_type: "USD", ref_address: null },
      { symbol: "crvUSD", address: COMMON_ERC20S.crvUSD.toLowerCase(), peg_type: "USD", ref_address: null },
      { symbol: "FRAX", address: COMMON_ERC20S.FRAX.toLowerCase(), peg_type: "USD", ref_address: null },
      { symbol: "GHO", address: COMMON_ERC20S.GHO.toLowerCase(), peg_type: "USD", ref_address: null },
      { symbol: "DOLA", address: COMMON_ERC20S.DOLA.toLowerCase(), peg_type: "USD", ref_address: null },
      { symbol: "USDe", address: COMMON_ERC20S.USDe.toLowerCase(), peg_type: "USD", ref_address: null },
      { symbol: "USDS", address: COMMON_ERC20S.USDS.toLowerCase(), peg_type: "USD", ref_address: null },
      { symbol: "RLUSD", address: COMMON_ERC20S.RLUSD.toLowerCase(), peg_type: "USD", ref_address: null },
      { symbol: "USR", address: COMMON_ERC20S.USR.toLowerCase(), peg_type: "USD", ref_address: null },
      { symbol: "frxUSD", address: COMMON_ERC20S.frxUSD.toLowerCase(), peg_type: "USD", ref_address: null },
      // ETH LSTs
      { symbol: "stETH", address: COMMON_ERC20S.stETH.toLowerCase(), peg_type: "ETH", ref_address: WETH },
      { symbol: "frxETH", address: COMMON_ERC20S.frxETH.toLowerCase(), peg_type: "ETH", ref_address: WETH },
      // Wrapped BTC
      { symbol: "WBTC", address: COMMON_ERC20S.WBTC.toLowerCase(), peg_type: "BTC", ref_address: WBTC },
      { symbol: "cbBTC", address: COMMON_ERC20S.cbBTC.toLowerCase(), peg_type: "BTC", ref_address: WBTC },
      { symbol: "tBTC", address: COMMON_ERC20S.tBTC.toLowerCase(), peg_type: "BTC", ref_address: WBTC },
    ],
    skipDuplicates: true,
  })
}
