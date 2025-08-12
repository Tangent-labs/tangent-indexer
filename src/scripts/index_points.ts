import * as dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"
import { TransactionPrisma } from "type/prisma"
import { BlockRepository } from "db/BlockRepository"
import { setUpIndexer } from "../config/indexer_setup"
import { BlockService } from "../services/BlockService"
import { UserEventsRepository } from "db/UserEventsRepository"
import { UserPointsRepository } from "db/UserPointsRepository"
import { UserPointsService } from "services/events/UserPointsService"

dotenv.config()

async function main() {
  const { providers, handleError } = setUpIndexer()
  const { prismaClient, userPointsService, blockService, setTransaction } = setUpIndexerBlockServices()

  try {
    const blockInfo = await BlockService.getPointsBlockInfo(providers, blockService)
    if (blockInfo === false) {
      console.log("Nothing to index")
      return
    }

    const { startBlock, endBlock, actualBlock } = blockInfo

    if (startBlock && endBlock) {
      console.log("indexing :", startBlock, "<----------------->", endBlock)
      await prismaClient.$transaction(
        async (dbTransaction: TransactionPrisma) => {
          setTransaction(dbTransaction)
          await userPointsService.retrieveUserAddressesFromTransfers(startBlock, endBlock)

          await userPointsService.updateUserTasks(startBlock)

          // Pour (chaque tâche ouverte) ET (chaque tâche fermée après le startBlock)
          // Calculer la time range (en fonction de l'unité)
          const currentTasks = await userPointsService.computeTimeRangeForOpenUserTasks(startBlock)
          console.log("currentTasks : ", currentTasks)

          // Récupérer le prix le plus proche du blockStart dans la table price_feed
          const upgradedTasks = await userPointsService.computeTokenPriceForTask(currentTasks)

          // Récupérer le boost le plus proche du blockStart dans la table boost
          const tasksWithBoosts = await userPointsService.computeClosestBoostForTasks(startBlock, upgradedTasks)
          console.log("tasksWithBoosts : ", tasksWithBoosts)

          // Calculer le nbr de pts sur la période // +- BOOST
          const tasksWithPoints = await userPointsService.computePointsForTasks(tasksWithBoosts)
          console.log("tasksWithPoints : ", tasksWithPoints)

          // Upsert
          await userPointsService.bulkUpsertUserPoints(tasksWithPoints)

          await blockService.updateLastEventBlockIndexed(endBlock)
        },
        {
          timeout: 10_000_000,
        }
      )
    } else {
      console.log("Nothing to index, Current block:", actualBlock)
    }
  } catch (e: any) {
    console.error("Error while indexing blocks", (e as Error).message)
    handleError(e as Error)
  }
}

main().then()

function setUpIndexerBlockServices() {
  const prismaClient = new PrismaClient()
  const blockRepository = new BlockRepository(prismaClient)
  const userEventsRepository = new UserEventsRepository(prismaClient)
  const userPointsRepository = new UserPointsRepository(prismaClient)

  const setTransaction = (dbTransaction: TransactionPrisma): void => {
    blockRepository.setClient(dbTransaction)
    userEventsRepository.setClient(dbTransaction)
  }

  const blockService = new BlockService(blockRepository)
  const userPointsService = new UserPointsService(userPointsRepository)

  return {
    prismaClient,
    userPointsService,
    blockService,
    setTransaction,
  }
}
