import * as dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"
import { JsonRpcProvider } from "ethers"

import { TransactionPrisma } from "../type/prisma.js"
import { BlockRepository } from "../db/BlockRepository.js"
import { UserVoteRepository } from "../db/UserVoteRepository.js"
import { BoostRepository } from "../db/BoostRepository.js"

import { setUpIndexer } from "../config/indexer_setup.js"
import { indexerConfig } from "../config/indexer_config.js"

import { BlockService } from "../services/BlockService.js"
import { SnapShotVoteService } from "../services/SnapShotVoteService.js"
import { OnChainVoteService } from "../services/OnChainVoteService.js"

dotenv.config()

async function main() {
  const { providers, handleError } = setUpIndexer()
  const { prismaClient, blockService, snapShotVoteService, onChainVoteService, setTransaction } = setUpIndexerVoteServices()

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

          const bestProvider = new JsonRpcProvider(indexerConfig.provider.chainRpc[bestProviderIndex])

          await snapShotVoteService.computeUserVoteTasks(startBlock, endBlock, blockService, bestProvider)
          await onChainVoteService.computeUserVoteTasks(bestProvider)

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
  const prismaClient = new PrismaClient({
    // log: ["query"], // log all SQL queries
  })
  const blockRepository = new BlockRepository(prismaClient)
  const userVoteRepository = new UserVoteRepository(prismaClient)
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
  }
}
