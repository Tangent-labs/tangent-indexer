import { Prisma } from "@prisma/client"
import { PENDLE_POOLS } from "@tangent/defi-resources"
import { CONVEX_LOCKER } from "@tangent/defi-resources/build/ressources/contracts/convex.js"
import { CURVE_CONTEXT } from "@tangent/defi-resources/build/ressources/mappings/curveContext.js"
import { ZeroAddress } from "ethers"
import { AddressesJson } from "../../../type/data.js"
import { TransactionPrisma } from "../../../type/prisma.js"
import { LP_TASKS } from "../config/config_lp_tasks.js"

export async function seedLPTasksAndTrackedERC20(
  prisma: TransactionPrisma,
  addresses: AddressesJson,
  priceSources: Prisma.price_sourceCreateManyInput[],
  now: Date
) {
  const lpTasks = LP_TASKS(addresses, priceSources, now)
  await prisma.tracked_erc20.createMany({
    data: lpTasks.map((t) => {
      return {
        address: t.token_address,
        name: t.name + " " + t.protocol,
        symbol: t.name + " " + t.protocol,
      }
    }),
  })

  await prisma.lp_task.createMany({
    data: lpTasks,
  })

  // TODO This needs to be update when we know the list
  const addressesToExclude = [
    ZeroAddress.toLowerCase(),
    CONVEX_LOCKER.toLowerCase(),
    // StakeDao staking on Convex

    // USDC-USG Sidecar
    "0x0e074EB3A9481B9E35fbFf9cDF663A1297b6a2D3",
    // frxUSD-USG Sidecar
    "0xF49C02627335346C451Be6b8Ab35e63f91F4Fd6A",

    // USG Curve LP holds USG
    CURVE_CONTEXT.USG_USDC.curveLp.toLowerCase(),
    CURVE_CONTEXT.USG_frxUSD.curveLp.toLowerCase(),

    // PegKeepers hold USG
    addresses.pegKeepers["USG-USDC"].toLowerCase(),
    addresses.pegKeepers["USG-frxUSD"].toLowerCase(),

    // Remove curve gauge
    CURVE_CONTEXT.USG_USDC.curveGauge.toLowerCase(),
    CURVE_CONTEXT.USG_frxUSD.curveGauge.toLowerCase(),

    // Remove Pendle Market because it holds PT
    PENDLE_POOLS["sUSDe 27/11/25"].MARKET.toLowerCase(),
    PENDLE_POOLS["sUSDe 27/11/25"].PT.toLowerCase(),
    PENDLE_POOLS["sUSDe 27/11/25"].SY.toLowerCase(),
  ].map((uE) => ({ user: uE }))

  await prisma.lp_points_users_excluded.createMany({
    data: addressesToExclude,
  })
}
