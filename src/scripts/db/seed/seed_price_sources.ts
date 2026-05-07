import { AddressesJson, PriceSourceCreate } from "../../../type/data.js"
import { TransactionPrisma } from "../../../type/prisma.js"

import { CURVE_CONTEXT } from "@tangent/defi-resources/build/ressources/mappings/curveContext.js"

function PRICE_SOURCES(addresses: AddressesJson): PriceSourceCreate[] {
  return [
    // Stable USD
    {
      name: "USG_USDC",
      type: "curveApi",
      reference: "factory-stable-ng",
      address: CURVE_CONTEXT.USG_USDC.curveLp,
    },
    {
      name: "USG_frxUSD",
      type: "curveApi",
      reference: "factory-stable-ng",
      address: CURVE_CONTEXT.USG_frxUSD.curveLp,
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
