import * as dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"
import { JsonRpcProvider } from "ethers"

import { TransactionPrisma } from "../type/prisma.js"
import { BlockRepository } from "../db/BlockRepository.js"
import { UserPointsVoteRepository } from "../db/Points/UserPointsVoteRepository.js"
import { BoostRepository } from "../db/Points/BoostRepository.js"

import { setUpIndexer } from "../config/indexer_setup.js"

import { BlockService } from "../services/BlockService.js"
import { SnapShotVoteService } from "../services/SnapShotVoteService.js"
import { OnChainVoteService } from "../services/OnChainVoteService.js"

dotenv.config()

async function main() {
  const { providers, handleError } = setUpIndexer()
  const { prismaClient, blockService, snapShotVoteService, onChainVoteService, blockRepository, setTransaction } = setUpIndexerVoteServices()

  try {
    const blockInfo = await blockService.getLastEpochDateAndBestProvider(providers)

    const { bestProvider, lastEpochDate } = blockInfo
    await prismaClient.$transaction(
      async (dbTransaction: TransactionPrisma) => {
        setTransaction(dbTransaction)
        // Retrieve the last block
        const now = await onChainVoteService.computeUserVoteTasks(bestProvider)
        const newEpochDate = onChainVoteService.verifyEpochFullyFinished(now, lastEpochDate)
        await snapShotVoteService.computeUserVoteTasks(newEpochDate)
        await blockRepository.storeVotesPointsBlock(now, newEpochDate)
      },
      {
        timeout: 10_000_000,
      }
    )
  } catch (e: any) {
    console.error("Error while indexing blocks", (e as Error).message)
    handleError(e as Error)
  }
}

main().then()

function setUpIndexerVoteServices() {
  const prismaClient = new PrismaClient({
    // log: ["query"], // log all SQL queries
  })
  const blockRepository = new BlockRepository(prismaClient)
  const userVoteRepository = new UserPointsVoteRepository(prismaClient)
  const boostRepository = new BoostRepository(prismaClient)

  const setTransaction = (dbTransaction: TransactionPrisma): void => {
    blockRepository.setClient(dbTransaction)
    userVoteRepository.setClient(dbTransaction)
  }

  const rpcProvider = new JsonRpcProvider()

  const blockService = new BlockService(blockRepository)
  const snapShotVoteService = new SnapShotVoteService(userVoteRepository)
  const onChainVoteService = new OnChainVoteService(userVoteRepository, boostRepository, rpcProvider)

  return {
    prismaClient,
    snapShotVoteService,
    onChainVoteService,
    blockService,
    setTransaction,
    blockRepository,
  }
}
