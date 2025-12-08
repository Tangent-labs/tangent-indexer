import * as dotenv from "dotenv"
import { Queue } from "bullmq"
import { indexerConfig } from "../../config/indexer_config.js"
import { SerializedLiquidationUserFullInfo } from "../../type/data.js"

dotenv.config()

/**
 * Main function
 */
async function main() {
  // Validate liquidation queue Redis configuration
  if (!indexerConfig.liquidationQueueRedis || indexerConfig.liquidationQueueRedis.trim() === "") {
    console.error("❌ Error: LIQUIDATION_QUEUE_REDIS is not configured.")
    console.error("Please set the LIQUIDATION_QUEUE_REDIS environment variable.")
    process.exit(1)
  }

  // Create queue connection
  const queue = new Queue<SerializedLiquidationUserFullInfo>("liquidatorQueue", {
    connection: indexerConfig.liquidationQueueRedis as any, // BullMQ accepts connection string
  })

  try {
    const counts = await queue.getJobCounts()
    console.log("counts", counts)
    // Display queue status
    console.log("\n📊 Current queue status:")
    console.log(`  - Waiting: ${counts.waiting}`)
    console.log(`  - Active: ${counts.active}`)
    console.log(`  - Completed: ${counts.completed}`)
    console.log(`  - Failed: ${counts.failed}`)
    console.log(`  - Delayed: ${counts.delayed}`)
    console.log(`  - Total: ${counts.waiting + counts.active + counts.completed + counts.failed + counts.delayed}\n`)

    // Read and display jobs
    // await readQueue(queue, state, limit)
  } catch (error) {
    console.error("❌ Error:", (error as Error).message)
    if ((error as Error).stack) {
      console.error("Stack trace:", (error as Error).stack)
    }
    process.exit(1)
  } finally {
    await queue.close()
  }
}

// Run main function if this file is being run directly
main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error("Failed to execute:", error)
    process.exit(1)
  })
