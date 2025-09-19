import { PrismaClient } from "@prisma/client"
import { readFileSync } from "fs"

async function main() {
  const prisma: PrismaClient = new PrismaClient()

  const sql = readFileSync("./src/sql-functions/actualize-views.sql", "utf8")

  // split by semicolon, remove empty lines
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt)
    console.log(`✅ Executed: ${stmt.substring(0, 40)}...`)
  }
}

main()
