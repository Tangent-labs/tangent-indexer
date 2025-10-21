import * as dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"
import { v4 as uuidv4 } from "uuid"

import { TransactionPrisma } from "../type/prisma.js"

import { BlockService } from "../services/BlockService.js"
import { UserPointsService } from "../services/events/UserPointsService.js"

import { UserEventsRepository } from "../db/UserEventsRepository.js"
import { UserPointsLPRepository } from "../db/Points/UserPointsLPRepository.js"
import { ERC20Repository } from "../db/ERC20Repository.js"
import { BlockRepository } from "../db/BlockRepository.js"

import { setUpIndexer } from "../config/indexer_setup.js"
import { indexerConfig } from "../config/indexer_config.js"
import { POINTS_BOT_ACTIONS } from "../type/data.js"

import { TelegramNotifierService } from "../services/TelegramNotificationServices.js"
import { NotificationService } from "../services/NotificationService.js"
import { PointsBotLogRepository } from "../db/Points/PointsBotLogRepository.js"
import { ActiveBorrowersRepository } from "../db/ActiveBorrowersRepository.js"

dotenv.config()

async function main() {
  const { providers, handleError } = setUpIndexer()
  const { prismaClient, userPointsService, blockService, setTransaction, blockRepository, notificationService } = setUpIndexerPointServices()
  let currentAction = POINTS_BOT_ACTIONS.POINTS_INDEXER
  const executionKey = uuidv4()
  try {
    const blockInfo = await blockService.getLPPointsBlockInfo(providers)
    if (blockInfo === false) {
      console.log("Nothing to index")
      return
    }

    const { startBlock, endBlock, bestProviderIndex } = blockInfo
    // const random = endBlock.totp()

    if (startBlock && endBlock) {
      console.log("indexing :", startBlock, "<----------------->", endBlock)
      await prismaClient.$transaction(
        async (dbTransaction: TransactionPrisma) => {
          setTransaction(dbTransaction)
          await userPointsService.retrieveUserAddressesFromTransfers(startBlock, endBlock)

          // TODO: get price

          // TODO: get boost
          currentAction = POINTS_BOT_ACTIONS.POINTS_PROCESS_USER_TASK
          await userPointsService.updateLPUserTasks(startBlock, endBlock)
          await notificationService.addPointNotification(executionKey, {
            process: POINTS_BOT_ACTIONS.POINTS_PROCESS_USER_TASK,
            error: null,
            action: currentAction,
            message: "EXEC",
            level: "INFO",
          })

          // Process points calculation for user tasks
          currentAction = POINTS_BOT_ACTIONS.POINTS_CALCULATE_POINTS
          await userPointsService.processUserPoints(startBlock, endBlock, blockService, indexerConfig.provider.chainRpc[bestProviderIndex])
          await notificationService.addPointNotification(executionKey, {
            process: POINTS_BOT_ACTIONS.POINTS_CALCULATE_POINTS,
            error: null,
            action: currentAction,
            message: "EXEC",
            level: "INFO",
          })
          // Update block logic
          await blockRepository.storeLPPointsBlock(endBlock)
        },
        {
          timeout: 10_000_000,
        }
      )
    } else {
      await notificationService.addPointWarningNotification(executionKey, {
        process: "indexer points",
        error: null,
        message: `Nothing to index, blocks: ${startBlock} -> ${endBlock}`,
        action: POINTS_BOT_ACTIONS.POINTS_INDEXER,
        level: "WARNING",
      })
    }
  } catch (e: any) {
    console.error("Error while indexing blocks", (e as Error).message)
    await notificationService.addPointErrorNotification(executionKey, {
      process: "indexer points",
      error: e as Error,
      action: currentAction || POINTS_BOT_ACTIONS.POINTS_GENERAL,
      level: "ERROR",
    })
    handleError(e as Error)
  }
}

main().then()

function setUpIndexerPointServices() {
  const prismaClient = new PrismaClient()
  const blockRepository = new BlockRepository(prismaClient)
  const userEventsRepository = new UserEventsRepository(prismaClient)
  const userPointsLPRepository = new UserPointsLPRepository(prismaClient)
  const erc20Repository = new ERC20Repository(prismaClient)
  const notificationRepository = new PointsBotLogRepository(prismaClient)
  const activeBorrowerRepository = new ActiveBorrowersRepository(prismaClient)

  const setTransaction = (dbTransaction: TransactionPrisma): void => {
    blockRepository.setClient(dbTransaction)
    userEventsRepository.setClient(dbTransaction)
  }

  const telegramNotifierService = new TelegramNotifierService({
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
  })
  const blockService = new BlockService(blockRepository)
  const userPointsService = new UserPointsService(userPointsLPRepository, erc20Repository, activeBorrowerRepository)
  const notificationService = new NotificationService(notificationRepository, telegramNotifierService)

  return {
    prismaClient,
    userPointsService,
    blockService,
    notificationService,
    telegramNotifierService,
    setTransaction,
    blockRepository,
  }
}
