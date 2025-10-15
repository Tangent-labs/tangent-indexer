import { PriceSourceCreate } from "../../type/data.js"
import { TransactionPrisma } from "../../type/prisma.js"

import { CRV_DUO_CVG_ETH } from "@tangent/defi-resources/build/ressources/lps/curve.js"

const priceFeedData: PriceSourceCreate[] = [
  // Stable USD
  {
    address: "0x4DEcE678ceceb27446b35C672dC7d61F30bAD69E",
    name: "USDC_crvUSD",
    type: "curveApi",
    reference: "factory-crvUSD",
  },
  {
    address: "0xdBb1d219d84eaCEFb850ee04caCf2f1830934580",
    name: "frxUSD_USDe",
    type: "curveApi",
    reference: "factory-crvUSD", // TBD
  },
  // Stable ETH
  {
    address: "0x6951bDC4734b9f7F3E1B74afeBC670c736A0EDB6",
    name: "pxETH_stETH",
    type: "curveApi",
    reference: "factory-stable-ng",
  },
  // Stable BTC
  {
    address: "0x839d6bDeDFF886404A6d7a788ef241e4e28F4802",
    name: "cbBTC_WBTC",
    type: "curveApi",
    reference: "factory-stable-ng", // TBD
  },

  // TriCrypto
  {
    address: "0x4ebdf703948ddcea3b11f675b4d1fba9d2414a14",
    name: "crvUSD_ETH_CRV",
    type: "curveApi",
    reference: "factory-tricrypto",
  },
  {
    address: "0x7f86bf177dd4f3494b841a37e810a34dd56c829b",
    name: "USDC_WBTC_WETH",
    type: "curveApi",
    reference: "factory-tricrypto",
  },

  // DuoCrypto
  {
    address: "0xC907ba505C2E1cbc4658c395d4a2c7E6d2c32656",
    name: "USR_RLP",
    type: "curveApi",
    reference: "factory-tricrypto", // TBD
  },
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
    reference: "factory-twocrypto",
  },
]

export async function seedPriceSources(prisma: TransactionPrisma) {
  const priceSources = priceFeedData.map((item) => ({
    address: item.address.toLowerCase(),
    name: item.name,
    type: item.type,
    reference: item.reference?.toLowerCase() || null,
  }))

  await prisma.price_source.createMany({
    data: priceSources,
  })

  console.log(`Price sources seeded successfully! ${priceSources.length} entries processed.`)
}
