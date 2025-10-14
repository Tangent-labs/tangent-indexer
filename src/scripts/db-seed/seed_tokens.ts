import { CURVE_CONTEXT } from "@tangent/defi-resources/build/ressources/mappings/curveContext.js"
import { AddressesJson } from "type/data.js"
import { TransactionPrisma } from "type/prisma.js"

export async function seedTokensToTrack(tx: TransactionPrisma, addresses: AddressesJson) {
  const tokens = [
    {
      address: addresses.tokens.USG.toLowerCase(),
      name: "USG",
      symbol: "USG",
    },
    {
      address: addresses.tokens.sUSG.toLowerCase(),
      name: "sUSG",
      symbol: "sUSG",
    },
    {
      address: CURVE_CONTEXT.USDT_crvUSD.curveLp.toLowerCase(),
      name: "USDT_crvUSD curveLp",
      symbol: "USDT_crvUSD",
    },
    {
      address: CURVE_CONTEXT.USDC_crvUSD.curveLp.toLowerCase(),
      name: "USDC_crvUSD curveLp",
      symbol: "USDC_crvUSD",
    },
  ]
  await tx.tracked_erc20.createMany({
    data: tokens,
  })
  console.log("Price feeds seeded successfully!")
}
