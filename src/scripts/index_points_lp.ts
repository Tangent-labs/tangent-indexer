import * as dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"
import { TransactionPrisma } from "type/prisma.js"

import { BlockService } from "../services/BlockService.js"
import { UserPointsService } from "../services/events/UserPointsService.js"

import { UserEventsRepository } from "../db/UserEventsRepository.js"
import { UserPointsRepository } from "../db/UserPointsRepository.js"
import { ERC20Repository } from "../db/ERC20Repository.js"
import { BlockRepository } from "../db/BlockRepository.js"

import { setUpIndexer } from "../config/indexer_setup.js"
import { indexerConfig } from "../config/indexer_config.js"

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

    const { startBlock, endBlock, actualBlock, bestProviderIndex } = blockInfo

    if (startBlock && endBlock) {
      console.log("indexing :", startBlock, "<----------------->", endBlock)
      await prismaClient.$transaction(
        async (dbTransaction: TransactionPrisma) => {
          setTransaction(dbTransaction)
          await userPointsService.retrieveUserAddressesFromTransfers(startBlock, endBlock)

          // TODO: get price

          // TODO: get boost

          await userPointsService.updateUserTasks(startBlock, endBlock)

          // Process points calculation for user tasks
          await userPointsService.processUserPoints(startBlock, endBlock, blockService, indexerConfig.provider.chainRpc[bestProviderIndex])

          // Update block logic
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
  const erc20Repository = new ERC20Repository(prismaClient)

  const setTransaction = (dbTransaction: TransactionPrisma): void => {
    blockRepository.setClient(dbTransaction)
    userEventsRepository.setClient(dbTransaction)
  }

  const blockService = new BlockService(blockRepository)
  const userPointsService = new UserPointsService(userPointsRepository, erc20Repository)

  return {
    prismaClient,
    userPointsService,
    blockService,
    setTransaction,
  }
}
