import { PrismaClient } from "@prisma/client"
import { PriceSourceCreate } from "type/data"
import addresses from "../../addresses.json"

import { LPS } from "@tangent/defi-resources/build/ressources/mappings/curveLp"
import { ConvexCrvPools } from "@tangent/defi-resources"
import { CRV_DUO_CVG_ETH } from "@tangent/defi-resources/build/ressources/lps/curve"

const prisma = new PrismaClient()

const curveLP = [
  // Stable USD
  "USDC_crvUSD",
  "frxUSD_USDe",

  // Stable ETH
  "pxETH_stETH",

  // Stable BTC
  "cbBTC_WBTC",

  // TriCrypto
  "crvUSD_ETH_CRV",
  "USDC_WBTC_WETH",

  // DuoCrypto
  "USR_RLP",
]

const priceFeedData: PriceSourceCreate[] = [
  {
    address: "0xD533a949740bb3306d119CC777fa900bA034cd52",
    name: "CRVUSD",
    type: "llamaApi",
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
    reference: "0xD533a949740bb3306d119CC777fa900bA034cd52",
  },
  {
    address: CRV_DUO_CVG_ETH,
    name: "CRV_DUO_CVG_ETH",
    type: "curveApi",
    reference: LPS[CRV_DUO_CVG_ETH]?.type,
  },
]
curveLP.forEach((lp: string) => {
  const lpAddress = ConvexCrvPools[lp as keyof typeof ConvexCrvPools]?.lpToken
  if (!lpAddress) {
    return
  }
  const data = LPS[lpAddress as keyof typeof LPS]
  if (!data || !data.type) {
    return
  }

  priceFeedData.push({
    address: lpAddress.toLowerCase(),
    name: lp,
    type: "curveApi",
    reference: data.type,
  })
})

async function addMarkets() {
  const markets = addresses.markets

  await prisma.usg_markets.createMany({
    skipDuplicates: true,
    data: markets.map((market) => ({
      contract_address: market.marketAddress,
      contract_name: `market ${market.collatName}`,
      collateral_address: market.collatAddress,
      contract_type: market.marketType,
    })),
  })
}

async function seedPriceSources() {
  const priceSources = priceFeedData.map((item) => ({
    address: item.address.toLowerCase(),
    name: item.name,
    type: item.type,
    reference: item.reference?.toLowerCase() || null,
  }))

  await prisma.price_source.createMany({
    skipDuplicates: true,
    data: priceSources,
  })

  console.log(`Price sources seeded successfully! ${priceSources.length} entries processed.`)
}
;(async () => {
  await addMarkets()
  await seedPriceSources()
})()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect())
