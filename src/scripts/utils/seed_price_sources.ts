import { PrismaClient } from "@prisma/client"
import { PriceSourceCreate } from "type/data"

const prisma = new PrismaClient()

const priceFeedData: PriceSourceCreate[] = [
  {
    address: "0xD533a949740bb3306d119CC777fa900bA034cd52",
    name: "CRVUSD",
    type: "llamaApi",
  },
  {
    address: "0xDe6BF97B1cdee8a93Ddd8b45d504f247e6C9f886",
    name: "Curve.fi FLIP/stFLIP",
    type: "curveApi",
  },
  {
    address: "0xe2Ed1dAc3A9547BC6057e32bf8133b5268D7d987",
    name: "pxETH/stETH",
    type: "curveApi",
  },
  {
    address: "0xf99985822fb361117fcf3768d34a6353e6022f5f",
    name: "wstETH PT",
    type: "pendleApi",
  },
  {
    address: "0xf3abc972a0f537c1119c990d422463b93227cd83",
    name: "wstETH YT",
    type: "pendleApi",
  },
  {
    address: "0x0655977FEb2f289A4aB78af67BAB0d17aAb84367",
    name: "sCRVUSD",
    type: "ERC4626",
    ref_token: "0xD533a949740bb3306d119CC777fa900bA034cd52",
  },
]

async function seedPriceSources() {
  const priceSources = priceFeedData.map((item) => ({
    address: item.address.toLowerCase(),
    name: item.name,
    type: item.type,
    ref_token: item.ref_token?.toLowerCase() || null,
  }))

  for (const priceSource of priceSources) {
    await prisma.price_source.createMany({
      data: priceSource,
    })
  }

  console.log(`Price sources seeded successfully! ${priceSources.length} entries processed.`)
}

seedPriceSources()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect())
