import { BlockService } from "../services/BlockService"
import { setUpIndexer } from "../config/indexer_setup"
import { TransactionPrisma } from "type/prisma"
import { PrismaClient } from "@prisma/client"
import { BlockRepository } from "db/BlockRepository"
import { MarketBorrowerRepository } from "db/MarketBorrowerRepository"
import { MarketContractsRepository } from "db/MarketContractsRepository"
import { MarketDepositRepository } from "db/MarketDepositRepository"
import { MarketBorrowerService } from "services/MarketBorrowerService"
import { MarketLeverageService } from "services/MarketLeverageService"
import { MarketCreationService } from "services/MarketCreationService"
import { MarketDepositService } from "services/MarketDepositService"
import * as dotenv from "dotenv"
import { indexerConfig } from "config/indexer_config"
import { MarketRepayService } from "services/MarketRepayService"
import { MarketRepayRepository } from "db/MarketRepayRepository"
import { MarketLeverageRepository } from "db/MarketLeverageRepository"
dotenv.config()
async function main() {
  const { providers, handleError } = setUpIndexer()
  const {
    prismaClient,
    marketBorrowerService,
    marketCreationService,
    marketDepositService,
    marketLeverageService,
    marketRepayService,
    blockService,
    setTransation,
  } = setUpIndexerBlockServices()

  try {
    const blockInfo = await BlockService.getIndexerBlockInfo(providers, blockService)
    if (blockInfo === false) {
      console.log("Nothing to index")
      return
    }

    const { startBlock, endBlock, actualBlock, bestProvider } = blockInfo

    if (startBlock && endBlock) {
      console.log("indexing :", startBlock, "<----------------->", endBlock)
      await prismaClient.$transaction(
        async (dbTransaction: TransactionPrisma) => {
          // Set the database transaction to the repositories
          setTransation(dbTransaction)

          // Detect new markets
          await marketCreationService.runDetection(bestProvider, startBlock, endBlock)

          // Detect new borrowers
          await marketBorrowerService.runDetection(bestProvider, startBlock, endBlock)

          // Detect deposit events
          await marketDepositService.runDetection(bestProvider, startBlock, endBlock)

          // Detect repay events
          await marketRepayService.runDetection(bestProvider, startBlock, endBlock)

          // Detect repay events
          await marketLeverageService.runDetection(bestProvider, startBlock, endBlock)

          // Update the last indexed block
          await blockService.updateLastBlockIndexed(endBlock)
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
  // Setup the repositories
  const blockRepository = new BlockRepository(prismaClient)
  const marketContractsRepository = new MarketContractsRepository(prismaClient)
  const marketBorrowerRepository = new MarketBorrowerRepository(prismaClient)
  const marketDepositRepository = new MarketDepositRepository(prismaClient)
  const marketRepayRepository = new MarketRepayRepository(prismaClient)
  const marketLeverageRepository = new MarketLeverageRepository(prismaClient)

  const setTransation = (dbTransaction: TransactionPrisma): void => {
    blockRepository.setClient(dbTransaction)
    marketContractsRepository.setClient(dbTransaction)
    marketBorrowerRepository.setClient(dbTransaction)
    marketDepositRepository.setClient(dbTransaction)
    marketRepayRepository.setClient(dbTransaction)
    marketLeverageRepository.setClient(dbTransaction)
  }

  // Set up the services
  const blockService = new BlockService(blockRepository)
  const marketCreationService = new MarketCreationService(marketContractsRepository, indexerConfig.contracts.marketCreatorAddress)
  const marketBorrowerService = new MarketBorrowerService(marketBorrowerRepository, marketCreationService.marketContractsRepository)
  const marketDepositService = new MarketDepositService(marketDepositRepository, marketContractsRepository)
  const marketRepayService = new MarketRepayService(marketRepayRepository, marketContractsRepository)
  const marketLeverageService = new MarketLeverageService(marketLeverageRepository, marketContractsRepository)

  return {
    prismaClient,
    marketCreationService,
    marketBorrowerService,
    marketDepositService,
    marketRepayService,
    marketLeverageService,
    blockService,
    setTransation,
  }
}
