import { Prisma, PrismaClient } from "@prisma/client"

import { deploySQLFunctions } from "./deploy_sql_functions.js"
import { seedPriceFeeds } from "./seed_tokens.js"
import { seedLPTasks } from "./seed_lp_tasks.js"
import { seedVoteTasks } from "./seed_vote_tasks.js"
import * as dotenv from "dotenv"
import { getAddressesJson } from "utils/jsonReader.js"
dotenv.config()

const prisma = new PrismaClient()
async function main() {
  const addresses = await getAddressesJson()
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await deploySQLFunctions(tx)
    await seedPriceFeeds(tx, addresses)
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
