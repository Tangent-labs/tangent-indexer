import { Prisma, PrismaClient } from "@prisma/client"

import { deploySQLFunctions } from "./deploy_sql_functions.js"
import { seedTokensToTrack } from "./seed_tokens.js"
import { seedLPTasks } from "./seed_lp_tasks.js"
import { seedVoteTasks } from "./seed_vote_tasks.js"
import * as dotenv from "dotenv"
import { getAddressesJson } from "utils/jsonReader.js"
import { seedPriceSources } from "./seed_price_sources.js"
dotenv.config()

const prisma = new PrismaClient()
async function main() {
  const addresses = await getAddressesJson()
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await deploySQLFunctions(tx)
    await seedTokensToTrack(tx, addresses)
    await seedPriceSources(tx)
    await seedLPTasks(tx, addresses)
    await seedVoteTasks(tx)
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
