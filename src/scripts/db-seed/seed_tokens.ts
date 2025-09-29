import { Prisma } from "@prisma/client"
import { CURVE_CONTEXT } from "@tangent/defi-resources/build/ressources/mappings/curveContext"
import { TransactionPrisma } from "type/prisma"
import { AddressesJson } from "utils/readGDrive"

export async function seedPriceFeeds(tx: TransactionPrisma, addresses: AddressesJson) {

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
      address: CURVE_CONTEXT.USDT_crvUSD.stakeDaoGauge.toLowerCase(),
      name: "USDT_crvUSD stakeDaoGauge",
      symbol: "USDT_crvUSD",
    },
    {
      address: CURVE_CONTEXT.USDT_crvUSD.curveLp.toLowerCase(),
      name: "USDT_crvUSD curveLp",
      symbol: "USDT_crvUSD",
    },
    {
      address: CURVE_CONTEXT.USDC_crvUSD.stakeDaoGauge.toLowerCase(),
      name: "USDC_crvUSD stakeDaoGauge",
      symbol: "USDC_crvUSD",
    },
    {
      address: CURVE_CONTEXT.USDC_crvUSD.curveLp.toLowerCase(),
      name: "USDC_crvUSD curveLp",
      symbol: "USDC_crvUSD",
    },
    {
      address: CURVE_CONTEXT.USDe_USDC.curveLp.toLowerCase(),
      name: "USDe_USDC curveLp",
      symbol: "USDe_USDC",
    },
    {
      address: CURVE_CONTEXT.USDe_USDC.curveGauge.toLowerCase(),
      name: "USDe_USDC gauge",
      symbol: "USDe_USDC",
    },
  ]

  const currentTimestamp = 1759167 // 12 Aout 2025
  const oneDaySeconds = 24 * 60 * 60
  const oneMontAgo = currentTimestamp - 30 * oneDaySeconds

  for (const token of tokens) {
    // Ensure token exists in tracked_erc20 table
    await tx.tracked_erc20.upsert({
      where: { address: token.address },
      update: {},
      create: token,
    })

    let priceFeedsToInsert: Prisma.price_feedsCreateManyInput[] = []
    // Generate price feeds for each day
    for (let ts = oneMontAgo; ts <= currentTimestamp; ts += oneDaySeconds) {
      priceFeedsToInsert.push({
        token: token.address,
        timestamp: new Date(ts * 1000),
        price_usd: "1",
      })
    }

    await tx.price_feeds.createMany({
      data: priceFeedsToInsert,
    })
  }

  console.log("Price feeds seeded successfully!")
}

