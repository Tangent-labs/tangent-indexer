import { Prisma, PrismaClient } from "@prisma/client"
import { deploySQLFunctions } from "./deploy_sql_functions"
import { seedPriceFeeds } from "./seed_tokens"
import { seedLPTasks } from "./seed_lp_tasks"
import { seedVoteTasks } from "./seed_vote_tasks"
import { AddressesJson, readJsonFile } from "utils/readGDrive"
import * as dotenv from "dotenv"
dotenv.config()

const prisma = new PrismaClient()
async function main() {
    console.log(process.env.GOOGLE_ADDRESSES_FILE_ID)

    const addresses = await readJsonFile<AddressesJson>(process.env.GOOGLE_ADDRESSES_FILE_ID!.toString())
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await deploySQLFunctions(tx)
        await seedPriceFeeds(tx, addresses)
        await seedLPTasks(tx)
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


