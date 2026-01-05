import * as dotenv from "dotenv"
import { Queue, type Queue as BullQueue } from "bullmq"
import { indexerConfig } from "../../config/indexer_config.js"
import { SerializedLiquidationUserFullInfo } from "../../type/data.js"

dotenv.config()

/**
 * Gets the count of jobs in different states
 */
async function getJobCounts(queue: BullQueue<SerializedLiquidationUserFullInfo>): Promise<void> {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ])

  console.log("\n📊 Current queue status:")
  console.log(`  - Waiting: ${waiting}`)
  console.log(`  - Active: ${active}`)
  console.log(`  - Completed: ${completed}`)
  console.log(`  - Failed: ${failed}`)
  console.log(`  - Delayed: ${delayed}`)
  console.log(`  - Total: ${waiting + active + completed + failed + delayed}\n`)
}

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
    await getJobCounts(queue)
    await queue.obliterate({ force: true }) // BullMQ uses obliterate instead of empty
  } catch (error) {
    console.error("❌ Error:", (error as Error).message)
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
