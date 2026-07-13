import * as dotenv from "dotenv"
import { Queue } from "bullmq"
import { liquidationConfig } from "../../config/liquidation_config.js"
import { SerializedLiquidationUserFullInfo } from "../../type/data.js"

dotenv.config()

const NEW_ATTEMPTS = 100

/**
 * Re-arm failed liquidation jobs:
 *  - raise their per-job `attempts` limit to NEW_ATTEMPTS
 *  - reset `attemptsMade` and re-queue them via job.retry()
 *
 * Optionally pass a specific job id as the first CLI arg to only act on that job.
 */
async function main() {
  if (!liquidationConfig.queueRedis || liquidationConfig.queueRedis.trim() === "") {
    console.error("❌ Error: LIQUIDATION_QUEUE_REDIS is not configured.")
    process.exit(1)
  }

  const targetJobId = process.argv[2] // optional

  const queue = new Queue<SerializedLiquidationUserFullInfo>("liquidatorQueue", {
    connection: liquidationConfig.queueRedis as any,
  })

  try {
    const failedJobs = await queue.getJobs(["failed"])
    const jobs = targetJobId ? failedJobs.filter((j) => j.id === targetJobId) : failedJobs

    if (jobs.length === 0) {
      console.log(targetJobId ? `No failed job found with id ${targetJobId}` : "No failed jobs found.")
      return
    }

    console.log(`Re-arming ${jobs.length} failed job(s) to ${NEW_ATTEMPTS} attempts...`)

    const client = await queue.client
    const prefix = queue.opts.prefix ?? "bull"

    for (const job of jobs) {
      // The per-job `opts` are stored as a JSON blob in the job's Redis hash.
      // updateData() only rewrites `data`, so patch `opts` directly.
      const newOpts = { ...job.opts, attempts: NEW_ATTEMPTS }
      await client.hset(`${prefix}:${queue.name}:${job.id}`, "opts", JSON.stringify(newOpts))

      // retry() resets attemptsMade to 0 and moves the job back to "waiting"
      await job.retry()

      console.log(`  ✓ Job ${job.id} re-armed (attempts=${NEW_ATTEMPTS}, attemptsMade reset)`)
    }

    console.log("Done.")
  } catch (error) {
    console.error("❌ Error:", (error as Error).message)
    process.exit(1)
  } finally {
    await queue.close()
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to execute:", error)
    process.exit(1)
  })
