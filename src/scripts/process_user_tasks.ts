import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function processUserTasks() {
  let lastProcessedBlock = await prisma.last_processed_block.findUnique({
    where: { id: 1 },
  })
  if (!lastProcessedBlock) {
    await prisma.last_processed_block.create({ data: { id: 1, block_id: 0 } })
    lastProcessedBlock = { id: 1, block_id: 0 }
  }
  const lastBlockId = lastProcessedBlock.block_id

  // Get all active tasks to map token_address to task_id
  const tasks = await prisma.task.findMany({
    where: { is_active: true },
    select: { id: true, token: true },
  })

  // Get all user addresses
  const userAddresses = await prisma.user_addresses.findMany({
    select: { address: true },
  })

  // Find all relevant transfer events for registered users since last processed block
  const relevantEvents = await prisma.transfert_events.findMany({
    where: {
      OR: userAddresses.map((user) => ({
        OR: [{ from: { equals: user.address.toLowerCase(), mode: "insensitive" } }, { to: { equals: user.address.toLowerCase(), mode: "insensitive" } }],
      })),
      block_id: { gt: lastBlockId },
    },
    orderBy: { block_id: "asc" }, // Process events chronologically
  })

  for (const event of relevantEvents) {
    // Map token_address to task_id
    const task = tasks.find((t) => t.token.toLowerCase() === event.token_address.toLowerCase())
    if (!task) {
      console.warn(`No matching task for token ${event.token_address}, skipping`)
      continue
    }

    const userAddress = userAddresses.find(
      (u) => u.address.toLowerCase() === event.from.toLowerCase() || u.address.toLowerCase() === event.to.toLowerCase()
    )?.address

    if (!userAddress) {
      console.warn(`No matching user for event ${event.tx_hash}, skipping`)
      continue
    }

    const eventAmount = parseFloat(event.amount)
    if (isNaN(eventAmount)) {
      console.warn(`Invalid amount for event ${event.tx_hash}, skipping`)
      continue
    }

    // Determine if it's a deposit or withdrawal
    const isDeposit = event.from.toLowerCase() === userAddress.toLowerCase()
    const amountChange = isDeposit ? eventAmount : -eventAmount

    // Find the most recent open task for this user and task
    const openTask = await prisma.user_tasks.findFirst({
      where: {
        user_address: userAddress,
        task_id: task.id,
        closed: null,
      },
      orderBy: { start: "desc" },
      take: 1,
    })

    if (!openTask) {
      // New event: Create a new task with initial balance
      await prisma.user_tasks.create({
        data: {
          task_id: task.id,
          user_address: userAddress,
          start: event.block_date,
          amount: amountChange, // Initial balance
          closed: null,
        },
      })
      console.log(`Opened new task ${task.id} for user ${userAddress} at ${event.block_date} with amount ${amountChange}`)
    } else {
      // Close the existing task and open a new one
      const previousAmount = openTask.amount || 0
      const newAmount = previousAmount + amountChange // Running balance

      await prisma.user_tasks.update({
        where: { id: openTask.id },
        data: { closed: event.block_date },
      })

      console.log(`Closed task ${task.id} for user ${userAddress} at ${event.block_date}`)

      if (newAmount > 0.01) {
        await prisma.user_tasks.create({
          data: {
            task_id: task.id,
            user_address: userAddress,
            start: event.block_date, // Chain with previous closed time
            amount: newAmount, // Updated running balance
            closed: null,
          },
        })
        console.log(`Opened new task with amount ${newAmount}`)
      }
    }
  }

  const maxBlockId = await prisma.transfert_events.aggregate({
    _max: { block_id: true },
    where: { block_id: { gt: lastBlockId } },
  })
  if (maxBlockId._max.block_id) {
    await prisma.last_processed_block.update({
      where: { id: 1 },
      data: { block_id: maxBlockId._max.block_id },
    })
    console.log(`Updated last processed block to ${maxBlockId._max.block_id}`)
  } else {
    console.log("No new blocks processed")
  }

  console.log("User tasks processing completed")
}

processUserTasks()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
