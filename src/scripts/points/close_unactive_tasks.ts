import { PrismaClient } from "@prisma/client"
import { indexerConfig } from "../../config/indexer_config.js"
import { setUpIndexer } from "../../config/indexer_setup.js"
import { BlockRepository } from "../../db/BlockRepository.js"
import { BlockService } from "../../services/BlockService.js"
import { TransactionPrisma } from "../../type/prisma.js"

const closeDesactivatedTasks = async (taskIds: bigint[]) => {
  const { providers, handleError } = setUpIndexer()

  try {
    const prisma = new PrismaClient()

    const blockRepository = new BlockRepository(prisma)
    const blockService = new BlockService(blockRepository)

    const blockInfo = await blockService.getIndexerBlockInfo(providers)

    if (blockInfo === false) {
      console.log("Can not retrieve current block info")
      return
    }

    const { bestProviderIndex, actualBlock } = blockInfo

    const blocks = await blockService.fetchBlockTimestamps([actualBlock], indexerConfig.provider.chainRpc[bestProviderIndex])

    await prisma.$transaction(
      async (dbTransaction: TransactionPrisma) => {
        console.log("Desactivating tasks:", taskIds)

        await dbTransaction.lp_task.updateMany({
          where: {
            id: { in: taskIds },
          },
          data: {
            is_active: false,
          },
        })

        await dbTransaction.lp_user_tasks.updateMany({
          where: {
            task_id: { in: taskIds },
            closed: null,
          },
          data: {
            closed: new Date(blocks.get(actualBlock)! * 1000),
          },
        })

        const updatedTasks = await dbTransaction.lp_task.findMany({
          where: { id: { in: taskIds } },
        })

        console.log("Updated tasks:", updatedTasks)
      },
      {
        timeout: 10_000_000,
      }
    )
  } catch (e: any) {
    console.error("Error while desactivating tasks", (e as Error).message)
    handleError(e as Error)
  }
}

closeDesactivatedTasks([386n])
