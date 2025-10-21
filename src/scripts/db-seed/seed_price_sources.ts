import { commonERC20, PendlePools } from "@tangent/defi-resources"
import { AddressesJson, PriceSourceCreate } from "../../type/data.js"
import { TransactionPrisma } from "../../type/prisma.js"

import { CURVE_CONTEXT } from "@tangent/defi-resources/build/ressources/mappings/curveContext.js"

function PRICE_SOURCES(addresses: AddressesJson): PriceSourceCreate[] {
  return [
    // Stable USD
    {
      name: "USDC_crvUSD",
      type: "curveApi",
      reference: "factory-crvUSD",
      address: CURVE_CONTEXT.USDC_crvUSD.curveLp,
    },
    {
      name: "USDT_crvUSD",
      type: "curveApi",
      reference: "factory-crvUSD",
      address: CURVE_CONTEXT.USDT_crvUSD.curveLp,
    },
    {
      name: "DOLA_sUSDS",
      type: "curveApi",
      reference: "factory-stable-ng",
      address: CURVE_CONTEXT.DOLA_sUSDS.curveLp,
    },
    {
      name: "LLAMALEND_sDOLA_crvUSD",
      type: "ERC4626",
      reference: commonERC20.crvUSD,
      address: CURVE_CONTEXT.LLAMALEND_sDOLA_crvUSD.curveLp,
    },
    {
      name: "USG",
      type: "chainview",
      address: addresses.tokens.USG,
    },
    {
      name: "sUSG",
      type: "chainview",
      address: addresses.tokens.sUSG,
    },
    // PENDLE
    {
      name: "PT sUSDe 27/11/25",
      type: "pendleApi",
      address: PendlePools["sUSDe 27/11/25"].PT,
    },
    {
      name: "LP sUSDe 27/11/25",
      type: "pendleApi",
      address: PendlePools["sUSDe 27/11/25"].MARKET,
    },
    {
      name: "YT sUSDe 27/11/25",
      type: "pendleApi",
      address: PendlePools["sUSDe 27/11/25"].YT,
    },
  ]
}

export async function seedPriceSources(prisma: TransactionPrisma, addresses: AddressesJson) {
  const priceSources = PRICE_SOURCES(addresses).map((item) => ({
    name: item.name,
    type: item.type,
    reference: item.reference?.toLowerCase() || null,
    address: item.address.toLowerCase(),
  }))
  console.log(`Price sources seeded successfully! ${priceSources.length} entries processed.`)

  return await prisma.price_source.createManyAndReturn({
    data: priceSources,
  })
}
