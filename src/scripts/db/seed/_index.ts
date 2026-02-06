import { Prisma, PrismaClient } from "@prisma/client"

import { deploySQLFunctions } from "./deploy_sql_functions.js"

import { seedLPTasksAndTrackedERC20 } from "./seed_lp_tasks.js"
import { seedVoteTasks } from "./seed_vote_tasks.js"
import * as dotenv from "dotenv"
import { getAddressesJson } from "../../../utils/jsonReader.js"
import { seedPriceSources } from "./seed_price_sources.js"
import { seedPredeposit } from "./seed_predeposit.js"
import { seedUSGContracts } from "./seed_usg_contracts.js"
import { seedBoosts } from "./seed_boosts.js"
import { JsonRpcProvider } from "ethers"
dotenv.config()

const prisma = new PrismaClient()
async function main() {
  const addresses = await getAddressesJson()
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const provider = new JsonRpcProvider(process.env.CHAIN_RPCS!.split(",")[0])
    const now = new Date((await provider.getBlock("latest"))!.timestamp * 1000)
    // Deploy the SQL functions
    await deploySQLFunctions(tx)
    // Insert the pricing sources of the tokens for the point programs
    const priceSources = await seedPriceSources(tx, addresses)
    await seedBoosts(tx)
    // Insert the points LP tasks
    await seedLPTasksAndTrackedERC20(tx, addresses, priceSources, now)
    // Insert the points Votes tasks
    await seedVoteTasks(tx)
    // Insert USG LP for mapping them with AddLiquidity during predeposit campaign
    await seedPredeposit(tx, addresses)
    // Seed Keepers and WStables contracts
    await seedUSGContracts(tx, addresses)
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
