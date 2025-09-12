import * as dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"
import { TransactionPrisma } from "type/prisma"
import { BlockRepository } from "db/BlockRepository"
import { setUpIndexer } from "../config/indexer_setup"
import { BlockService } from "../services/BlockService"
import { indexerConfig } from "config/indexer_config"
import SnapShotVoteService from "services/SnapShotVoteService"
import { UserVoteRepository } from "db/UserVoteRepository"

dotenv.config()

async function main() {
  const { providers, handleError } = setUpIndexer()
  const { prismaClient, blockService, snapShotVoteService, setTransaction } = setUpIndexerVoteServices()

  try {
    const blockInfo = await BlockService.getVotesBlockInfo(providers, blockService)
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

          await snapShotVoteService.computeUserVoteTasks(startBlock, endBlock, blockService, indexerConfig.provider.chainRpc[bestProviderIndex])

          await blockService.updateLastVoteBlockIndexed(endBlock)
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

function setUpIndexerVoteServices() {
  const prismaClient = new PrismaClient()
  const blockRepository = new BlockRepository(prismaClient)
  const userVoteRepository = new UserVoteRepository(prismaClient)

  const setTransaction = (dbTransaction: TransactionPrisma): void => {
    blockRepository.setClient(dbTransaction)
    userVoteRepository.setClient(dbTransaction)
  }

  const blockService = new BlockService(blockRepository)
  const snapShotVoteService = new SnapShotVoteService(userVoteRepository)

  return {
    prismaClient,
    snapShotVoteService,
    blockService,
    setTransaction,
  }
}
