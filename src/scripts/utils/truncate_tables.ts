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
async function getAllTableNames(): Promise<string[]> {
  try {
    const tables: { table_name: string }[] = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT tablename AS table_name 
      FROM pg_tables 
      WHERE schemaname = 'public'
    `
    return tables.map((table) => table.table_name)
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
    const tableNames: string[] = await getAllTableNames()
    if (tableNames.length === 0) {
      console.log("⚠️ No tables found.")
      return
    }

    // Truncate each table
    for (const tableName of tableNames) {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tableName}" CASCADE`)
      console.log(`✅ Truncated: ${tableName}`)
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
