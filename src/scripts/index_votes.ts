import * as dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"
import { TransactionPrisma } from "type/prisma"
import { BlockRepository } from "db/BlockRepository"
import { setUpIndexer } from "../config/indexer_setup"
import { BlockService } from "../services/BlockService"
import { UserEventsRepository } from "db/UserEventsRepository"
import { UserPointsRepository } from "db/UserPointsRepository"
import { UserPointsService } from "services/events/UserPointsService"
import SnapShotVoteService from "services/SnapShotVoteService"
import { indexerConfig } from "config/indexer_config"

dotenv.config()

async function main() {
  const { providers, handleError } = setUpIndexer()
  const { prismaClient, snapshotService, blockService, setTransaction } = setUpIndexerBlockServices()

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

          await snapshotService.computeVotes(startBlock, endBlock, blockService, indexerConfig.provider.chainRpc[bestProviderIndex])
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
  const snapshotService = new SnapShotVoteService()

  return {
    prismaClient,
    userPointsService,
    snapshotService,
    blockService,
    setTransaction,
  }
}
