import { PrismaClient } from "@prisma/client"
import { deploySQLFunctions } from "./deploy_sql_functions"
import { seedPriceFeeds } from "./seed_tokens"
import { seedLPTasks } from "./seed_lp_tasks"
import { seedVoteTasks } from "./seed_vote_tasks"


const prisma = new PrismaClient({ log: ["query"] })
async function main() {
    await prisma.$transaction((async (tx) => {
        await deploySQLFunctions(tx)
        await seedPriceFeeds(tx)
        await seedLPTasks(tx)
        await seedVoteTasks(tx)
    }))
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
function async(arg0: (tx: any) => void): import(".prisma/client").Prisma.PrismaPromise<any>[] {
    throw new Error("Function not implemented.")
}

