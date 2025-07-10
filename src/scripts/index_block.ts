import { BlockService } from "../services/BlockService"
import { setUpIndexer } from "../config/indexer_setup"
import { TransactionPrisma } from "type/prisma"
import { PrismaClient } from "@prisma/client"
import { BlockRepository } from "db/BlockRepository"
import { ActiveBorrowersRepository } from "db/ActiveBorrowersRepository"
import { MarketContractsRepository } from "db/MarketContractsRepository"
import { MarketCreationService } from "services/events/MarketCreationService"
import { UserMarketService } from "services/events/UserMarketService"
import * as dotenv from "dotenv"
import { indexerConfig } from "config/indexer_config"
import { AddressLike } from "ethers"
import { ActiveBorrowersService } from "services/ActiveBorrowersService"
import { UserEventsRepository } from "db/UserEventsRepository"
import { getEthLogs } from "eventFectcher/_baseFectcher"
import { fetchTransferLogs } from "eventFectcher/erc20TransferEventFetcher"
import { UserPointsService } from "services/events/PointsService"
import { UserPointsRepository } from "db/UserPointsRepository"
dotenv.config()
async function main() {
  const { providers, handleError } = setUpIndexer()
  const {
    prismaClient,
    userMarketService,
    userPointsService,
    marketCreationService,
    blockService,
    marketContractsRepository,
    activeBorrowersService,
    setTransaction,
  } = setUpIndexerBlockServices()

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

          // Get all market addresses after
          const marketContracts: AddressLike[] = (await marketContractsRepository.getContracts()).map((market) => market.contract_address as AddressLike)

          // Fetch all User market logs
          const logs = await getEthLogs(bestProvider, startBlock, endBlock, marketContracts, [])

          const transferToWatch = [
            "0x963B59A52647777E3646034213d6A7B5aEA4F1d8",
            "0xedb6a6D23Ed23c8024A1e48f877e81432041aE00",
            "0x3FD3d725e7Ab6C1E12a916410437f47b002560d2",
            "0xeef0c605546958c1f899b6fb336c20671f9cd49f",
            "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
            "0xB9E1E3A9feFf48998E45Fa90847ed4D467E8BcfD",
            "0xa569d910839Ae8865Da8F8e70FfFb0cBA869F961",
          ]

          const transferLogs = await fetchTransferLogs(bestProvider, startBlock, endBlock, transferToWatch)

          // Parse events with their proper topics and group all user events to update active borrowers
          const { activeBorrowActions, sortedAndParsedEvents, blockIds } = userMarketService.sortUserMarketLogs(logs)
          const { sortedAndParsedPointsEvents, pointsEventsBlockIds } = userPointsService.sortPointsActionsLogs(transferLogs)

          // Find block timestamps of the unique blockIDs
          const blocks = await blockService.fetchBlockTimestamps(blockIds, indexerConfig.provider.chainRpc[bestProviderIndex])
          const pointsEventsBlocks = await blockService.fetchBlockTimestamps(pointsEventsBlockIds, indexerConfig.provider.chainRpc[bestProviderIndex])

          const hydratedWithCorrectDates = userMarketService.replaceRightDates(sortedAndParsedEvents, activeBorrowActions, blocks)
          const pointsActionEventsDates = userPointsService.replaceDates(sortedAndParsedPointsEvents, pointsEventsBlocks)

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
    userPointsRepository.setClient(dbTransaction)
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
