import * as dotenv from "dotenv"

import { BlockService } from "../services/BlockService"
import { setUpIndexer } from "../config/indexer_setup"
import { TransactionPrisma } from "type/prisma"
import { PrismaClient } from "@prisma/client"
import { BlockRepository } from "db/BlockRepository"
import { ActiveBorrowersRepository } from "db/ActiveBorrowersRepository"
import { MarketContractsRepository } from "db/MarketContractsRepository"
import { MarketCreationService } from "services/events/MarketCreationService"
import { UserMarketService } from "services/events/UserMarketService"
import { indexerConfig } from "config/indexer_config"
import { ActiveBorrowersService } from "services/ActiveBorrowersService"
import { UserEventsRepository } from "db/UserEventsRepository"
import { getEthLogs } from "eventFectcher/_baseFectcher"
import { fetchTransferLogs } from "eventFectcher/erc20TransferEventFetcher"
import { UserPointsService } from "services/events/UserPointsService"
import { UserPointsRepository } from "db/UserPointsRepository"
dotenv.config()

async function main() {
  const { providers, handleError } = setUpIndexer()
  const { prismaClient, userMarketService, userPointsService, marketCreationService, blockService, activeBorrowersService, setTransaction } =
    setUpIndexerBlockServices()

  try {
    const blockInfo = await BlockService.getIndexerBlockInfo(providers, blockService)
    if (blockInfo === false) {
      console.log("Nothing to index")
      return
    }

    const { startBlock, endBlock, actualBlock, bestProvider, bestProviderIndex } = blockInfo

    if (startBlock && endBlock) {
      console.log("indexing :", startBlock, "<----------------->", endBlock)
      await prismaClient.$transaction(
        async (dbTransaction: TransactionPrisma) => {
          // Set the database transaction to the repositories
          setTransaction(dbTransaction)

          // Detect new markets
          await marketCreationService.runDetection(bestProvider, startBlock, endBlock)

          const { marketAddresses, mapMarketIdAddresses } = await marketCreationService.getMarketsAddressesAndMap()

          // Fetch all User market logs
          const logs = await getEthLogs(bestProvider, startBlock, endBlock, marketAddresses, [])

          const transferToWatch = await userPointsService.getERC20ToTrack()

          // Call fetchTransferLogs with the addresses
          const transferLogs = await fetchTransferLogs(bestProvider, startBlock, endBlock, transferToWatch)

          // Parse events with their proper topics and group all user events to update active borrowers
          const { activeBorrowActions, sortedAndParsedEvents, blockIds } = userMarketService.sortUserMarketLogs(logs, mapMarketIdAddresses)
          const { sortedAndParsedPointsEvents, pointsEventsBlockIds } = userPointsService.sortPointsActionsLogs(transferLogs)

          const uniqueBlockIds = [...new Set([...blockIds, ...pointsEventsBlockIds])]
          // Find block timestamps of the unique blockIDs
          const blocks = await blockService.fetchBlockTimestamps(uniqueBlockIds, indexerConfig.provider.chainRpc[bestProviderIndex])

          const hydratedWithCorrectDates = userMarketService.replaceRightDates(sortedAndParsedEvents, activeBorrowActions, blocks)
          const pointsActionEventsDates = userPointsService.replaceDates(sortedAndParsedPointsEvents, blocks)

          // Insert user points actions
          await userPointsService.insertEvents(pointsActionEventsDates.sortedParsedEvents)

          // Insert user events

          await userMarketService.insertEvents(hydratedWithCorrectDates.sortedParsedEvents)

          // Update active borrowers
          await activeBorrowersService.updateActiveBorrowers(hydratedWithCorrectDates.userActions)

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
  const userEventsRepository = new UserEventsRepository(prismaClient)
  const userPointsRepository = new UserPointsRepository(prismaClient)
  const activeBorrowersRepository = new ActiveBorrowersRepository(prismaClient)

  const setTransaction = (dbTransaction: TransactionPrisma): void => {
    blockRepository.setClient(dbTransaction)
    marketContractsRepository.setClient(dbTransaction)
    userEventsRepository.setClient(dbTransaction)
    activeBorrowersRepository.setClient(dbTransaction)
  }

  // Set up the services
  const blockService = new BlockService(blockRepository)
  const marketCreationService = new MarketCreationService(marketContractsRepository, indexerConfig.contracts.marketCreatorAddress)

  const userMarketService = new UserMarketService(userEventsRepository)
  const userPointsService = new UserPointsService(userPointsRepository)
  const activeBorrowersService = new ActiveBorrowersService(activeBorrowersRepository)

  return {
    prismaClient,
    marketCreationService,
    userEventsRepository,
    userMarketService,
    userPointsService,
    blockService,
    activeBorrowersService,
    setTransaction,
    marketContractsRepository,
  }
}
