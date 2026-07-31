import * as dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"

dotenv.config()

const SWAP_SQL = `
  UPDATE events.repay_and_withdraw
  SET repaid_amount = withdrawn_amount,
      withdrawn_amount = repaid_amount
`

async function main() {
  const prisma = new PrismaClient()

  try {
    console.log(`Target DB : ${process.env.DATABASE_URL}`)

    const total = await prisma.repay_and_withdraw.count()

    console.log(`events.repay_and_withdraw rows : ${total}`)

    if (total === 0) {
      console.log("Nothing to do")
      return
    }

    const swapped = await prisma.$executeRawUnsafe(SWAP_SQL)
    console.log(`\n Swapped repaid_amount <-> withdrawn_amount on ${swapped} rows.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
