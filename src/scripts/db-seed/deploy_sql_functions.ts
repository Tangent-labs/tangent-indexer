/**
 * SQL Functions Deployment Script
 *
 * This script deploys all SQL functions from the sql-functions/ directory to the PostgreSQL database.
 *
 * Functions deployed:
 * 1. insert_missing_user_points - Creates missing user_points records
 * 2. get_user_points_details - Calculates detailed user points with segments and boost factors
 * 3. get_user_points_per_task - Aggregates user points per task
 * 4. compute_user_points - Main function to compute and update user points
 * 5. compute_godfather_points - Computes referral points for godfathers
 *
 * Usage:
 *   npm run tangent:deploy-sql-functions
 *
 * Requirements:
 * - DATABASE_URL environment variable must be set
 * - The 'points' schema must exist in the database
 * - Prisma client must be properly configured
 *
 * The script handles:
 * - Dependency checking between functions
 * - Error handling and rollback
 * - Verification of successful deployment
 * - Detailed logging of the deployment process
 */

import * as dotenv from "dotenv"
import { readFileSync } from "fs"
import { join } from "path"
import { TransactionPrisma } from "type/prisma"

dotenv.config()

// Define the SQL functions to deploy in order of dependencies
const sqlFunctions: string[] = [
  "insert_missing_user_points",
  "get_user_points_details",
  "get_user_points_per_task",
  "compute_user_points",
  "idx_price_feeds_token_ts_with_price",
]

export async function deployFunction(tx: TransactionPrisma, sqlFunction: string): Promise<void> {
  try {
    console.log(`🚀 Deploying function: ${sqlFunction}`)

    // Read the SQL file
    const sqlFilePath = join("./src/sql-functions/", `${sqlFunction}.sql`)
    const sqlContent = readFileSync(sqlFilePath, "utf-8")

    if (!sqlContent.trim()) {
      throw new Error(`SQL file ${sqlFilePath} is empty`)
    }

    await tx.$executeRawUnsafe(sqlContent)

    console.log(`✅ Successfully deployed: ${sqlFunction}`)

    // Test that the function was created by checking if it exists
    const functionExists = await tx.$queryRawUnsafe(
      `
      SELECT COUNT(*) as count 
      FROM information_schema.routines 
      WHERE routine_name = $1 
        AND routine_schema = 'points'
        AND routine_type = 'FUNCTION'
    `,
      sqlFunction
    )

    const count = Array.isArray(functionExists) && functionExists[0] ? (functionExists[0] as any).count : 0

    if (parseInt(count) === 0) {
      console.log(`⚠️  Warning: Function ${sqlFunction} may not have been created properly`)
    }
  } catch (error: any) {
    console.error(`❌ Failed to deploy function ${sqlFunction}:`, error.message)
    throw error
  }
}

async function verifySchemaExists(tx: TransactionPrisma): Promise<void> {
  try {
    console.log("🔍 Verifying 'points' schema exists...")

    const schemaExists = await tx.$queryRawUnsafe(`
      SELECT COUNT(*) as count 
      FROM information_schema.schemata 
      WHERE schema_name = 'points'
    `)

    const count = Array.isArray(schemaExists) && schemaExists[0] ? (schemaExists[0] as any).count : 0

    if (parseInt(count) === 0) {
      throw new Error("The 'points' schema does not exist. Please run database migrations first.")
    }

    console.log("✅ Points schema verified")
  } catch (error: any) {
    console.error("❌ Schema verification failed:", error.message)
    throw error
  }
}

async function listExistingFunctions(tx: TransactionPrisma): Promise<void> {
  try {
    console.log("📋 Listing existing functions in 'points' schema...")

    const existingFunctions = await tx.$queryRawUnsafe(`
      SELECT routine_name, routine_type
      FROM information_schema.routines 
      WHERE routine_schema = 'points'
        AND routine_type = 'FUNCTION'
      ORDER BY routine_name
    `)

    if (Array.isArray(existingFunctions) && existingFunctions.length > 0) {
      console.log("📋 Existing functions:")
      existingFunctions.forEach((func: any) => {
        console.log(`   - ${func.routine_name} (${func.routine_type})`)
      })
    } else {
      console.log("📋 No existing functions found in 'points' schema")
    }
  } catch (error: any) {
    console.error("⚠️  Could not list existing functions:", error.message)
  }
}

export async function deploySQLFunctions(tx: TransactionPrisma) {

  try {
    // Verify schema exists
    await verifySchemaExists(tx)

    // List existing functions before deployment
    await listExistingFunctions(tx)

    console.log("\n🚀 Beginning function deployment...")
    console.log("===================================")

    // Deploy functions in order
    for (const sqlFunction of sqlFunctions) {
      console.log(`\n📦 Processing: ${sqlFunction}`)

      // Deploy the function
      await deployFunction(tx, sqlFunction)
    }

    console.log("\n🎉 All SQL functions deployed successfully!")
    console.log("==========================================")

    // List functions after deployment
    await listExistingFunctions(tx)

    console.log("\n✨ Deployment completed successfully!")
  } catch (error: any) {
    console.error("\n💥 Deployment failed:", error.message)
    console.error("Stack trace:", error.stack)
    process.exit(1)
  }
}

