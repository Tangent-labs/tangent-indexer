import { PrismaClient } from "@prisma/client"
import readline from "node:readline"

const prisma = new PrismaClient()

/**
 * Prompts the user for confirmation before proceeding.
 */
async function promptConfirmation(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    rl.question("\x1b[32m⚠️ Are you sure you want to truncate all tables? (y/n): \x1b[0m", (answer: string) => {
      rl.close()
      resolve(answer.trim().toLowerCase() === "y")
    })
  })
}

/**
 * Fetches all table names from the PostgreSQL database schema.
 */
async function getAllTableNames(): Promise<{ table_name: string; schema_name: string }[]> {
  try {
    const tables: { table_name: string; schema_name: string }[] = await prisma.$queryRaw<{ table_name: string; schema_name: string }[]>`
SELECT tablename AS table_name, schemaname AS schema_name FROM pg_tables WHERE schemaname = 'events' OR schemaname = 'global'
    `
    return tables.map((table) => {
      return { table_name: table.table_name, schema_name: table.schema_name }
    })
  } catch (error) {
    console.error("❌ Error fetching table names:", error)
    return []
  }
}

/**
 * Truncates all tables in the PostgreSQL database schema.
 */
async function truncateAllTables(): Promise<void> {
  try {
    const confirmed = await promptConfirmation()
    if (!confirmed) {
      console.log("❌ Operation canceled.")
      return
    }

    console.log("🔄 Truncating all tables in PostgreSQL...")

    // Disable foreign key constraints
    await prisma.$executeRawUnsafe("SET session_replication_role = 'replica'")

    // Fetch table names
    const tables: { table_name: string; schema_name: string }[] = await getAllTableNames()
    if (tables.length === 0) {
      console.log("⚠️ No tables found.")
      return
    }

    // Truncate each table
    for (const table of tables) {
      const tableToTruncate = `"${table.schema_name}".${table.table_name}`
      const truncateQuery = `TRUNCATE TABLE ${tableToTruncate} CASCADE`
      await prisma.$executeRawUnsafe(truncateQuery)
      console.log(`✅ Truncated: ${tableToTruncate}`)
    }

    // Re-enable foreign key constraints
    await prisma.$executeRawUnsafe("SET session_replication_role = 'origin'")

    console.log("🎉 All tables truncated successfully.")
  } catch (error) {
    console.error("❌ Error truncating tables:", error)
  } finally {
    await prisma.$disconnect()
  }
}

// Execute the function
truncateAllTables()
