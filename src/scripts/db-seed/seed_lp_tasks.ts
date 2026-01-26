import { CURVE_CONTEXT } from "@tangent/defi-resources/build/ressources/mappings/curveContext.js"
import { AddressesJson } from "../../type/data.js"
import { TransactionPrisma } from "../../type/prisma.js"
import { ZeroAddress } from "ethers"
import { CONVEX_LOCKER } from "@tangent/defi-resources/build/ressources/contracts/convex.js"
import { CURVE_LPS, PENDLE_POOLS } from "@tangent/defi-resources"
import { Prisma } from "@prisma/client"
import { LP_TASKS } from "./config/config_lp_tasks.js"

export async function seedLPTasksAndTrackedERC20(prisma: TransactionPrisma, addresses: AddressesJson, priceSources: Prisma.price_sourceCreateManyInput[]) {
  const lpTasks = LP_TASKS(addresses, priceSources)
  await prisma.tracked_erc20.createMany({
    data: lpTasks.map((t) => {
      return {
        address: t.token_address,
        name: t.name + " " + t.protocol,
        symbol: t.name + " " + t.protocol,
      }
    }),
  })

  // TEST ONLY, TO REMOVE
  await prisma.tracked_erc20.createMany({
    data: [
      { address: CURVE_LPS.crvUSD_USDC, name: "crvUSD_USDC", symbol: "crvUSD_USDC" },
      { address: CURVE_LPS.DUO_crvUSD_frxUSD, name: "crvUSD_frxUSD", symbol: "crvUSD_frxUSD" }],
  })

  await prisma.lp_task.createMany({
    data: lpTasks,
  })

  // TODO This needs to be update when we know the list
  const addressesToExclude = [
    ZeroAddress.toLowerCase(),
    CONVEX_LOCKER.toLowerCase(),
    // TODO add addresses of StakeDao and StakeDao staking on Convex

    // Remove curve gauge
    CURVE_CONTEXT.USDC_crvUSD.curveGauge.toLowerCase(),
    CURVE_CONTEXT.USDT_crvUSD.curveGauge.toLowerCase(),
    CURVE_CONTEXT.DOLA_sUSDS.curveGauge.toLowerCase(),
    CURVE_CONTEXT.LLAMALEND_sDOLA_crvUSD.curveGauge.toLowerCase(),

    // Remove Pendle Market because it holds PT
    PENDLE_POOLS["sUSDe 27/11/25"].MARKET.toLowerCase(),
    PENDLE_POOLS["sUSDe 27/11/25"].PT.toLowerCase(),
    PENDLE_POOLS["sUSDe 27/11/25"].SY.toLowerCase(),
  ].map((uE) => ({ user: uE }))

  await prisma.lp_points_users_excluded.createMany({
    data: addressesToExclude,
  })
}
