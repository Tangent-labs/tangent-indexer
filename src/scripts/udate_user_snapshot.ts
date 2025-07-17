import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function processTasksAndSnapshots() {
  let lastProcessedBlock = await prisma.last_processed_block.findUnique({
    where: { id: 1 },
  })

  if (!lastProcessedBlock) {
    await prisma.last_processed_block.create({
      data: { id: 1, block_id: 0 },
    })
    lastProcessedBlock = { id: 1, block_id: 0 }
  }

  const lastBlockId = lastProcessedBlock.block_id

  const tasks = await prisma.task.findMany({
    where: { is_active: true },
    select: { id: true, token: true },
  })

  for (const task of tasks) {
    const userAddresses = await prisma.user_addresses.findMany({
      select: { address: true },
    })

    for (const user of userAddresses) {
      const latestEvent = await prisma.transfert_events.findFirst({
        where: {
          token_address: {
            equals: task.token.toLowerCase(),
            mode: "insensitive",
          },
          OR: [{ from: { equals: user.address.toLowerCase(), mode: "insensitive" } }, { to: { equals: user.address.toLowerCase(), mode: "insensitive" } }],
          block_id: { gt: lastBlockId },
        },
        orderBy: { block_id: "desc" },
        take: 1,
      })

      if (latestEvent) {
        console.log("latestEvent : ", latestEvent)

        await prisma.user_snapshots.upsert({
          where: {
            user_address_task_id: {
              user_address: user.address,
              task_id: task.id,
            },
          },
          update: {
            timestamp: new Date(),
            amount: parseFloat(latestEvent.amount),
            external_id: latestEvent.tx_hash,
          },
          create: {
            user_address: user.address,
            task_id: task.id,
            timestamp: new Date(),
            amount: parseFloat(latestEvent.amount),
            external_id: latestEvent.tx_hash,
          },
        })

        console.log(`Processed task ${task.id} for user ${user.address} with block_id ${latestEvent.block_id}`)
      }
    }
  }

  const maxBlockId = await prisma.transfert_events.aggregate({
    _max: { block_id: true },
    where: {
      block_id: { gt: lastBlockId },
    },
  })
  if (maxBlockId._max.block_id) {
    await prisma.last_processed_block.update({
      where: { id: 1 },
      data: { block_id: maxBlockId._max.block_id },
    })
    console.log(`Updated last processed block to ${maxBlockId._max.block_id}`)
  }

  console.log("Snapshot processing completed")
}

processTasksAndSnapshots()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
