import { Prisma, PrismaClient } from "@prisma/client"
import * as dotenv from "dotenv"
import { TransactionPrisma } from "../../type/prisma.js"

import { setUpIndexer } from "../../config/indexer_setup.js"

import { ActiveBorrowersRepository } from "../../db/ActiveBorrowersRepository.js"
import { BlockRepository } from "../../db/BlockRepository.js"
import { ERC20Repository } from "../../db/ERC20Repository.js"
import { MarketContractsRepository } from "../../db/MarketContractsRepository.js"
import { UserPointsLPRepository } from "../../db/Points/UserPointsLPRepository.js"
import { UserPointsVoteRepository } from "../../db/Points/UserPointsVoteRepository.js"
import { PredepositCampaignRepository } from "../../db/PredepositCampaignRepository.js"
import { UserEventsRepository } from "../../db/UserEventsRepository.js"

import { ActiveBorrowersService } from "../../services/ActiveBorrowersService.js"
import { BlockService } from "../../services/BlockService.js"
import { MarketCreationService } from "../../services/events/MarketCreationService.js"
import { UserMarketService } from "../../services/events/UserMarketService.js"
import { UserPointsService } from "../../services/events/UserPointsService.js"
import { VotesEventService } from "../../services/events/VotesEventService.js"

import { getEthLogs } from "../../eventFectcher/_baseFetcher.js"
import { fetchTransferLogs } from "../../eventFectcher/erc20TransferEventFetcher.js"
import { getSavingAccountLogs } from "../../eventFectcher/savingAccountEventFetcher.js"

import { indexerConfig } from "../../config/indexer_config.js"
import { SavingAccountRepository } from "../../db/SavingAccountRepository.js"
import { SavingAccountServices } from "../../services/events/SavingAccountServices.js"
import { IndexerExecutionLogService } from "../../services/IndexerExecutionLogService.js"
import { PredepositCampaignService } from "../../services/PredepositCampaignService.js"
import { TelegramNotifierService } from "../../services/TelegramNotificationServices.js"
import { INDEXER_EXECUTION_NAMES } from "../../type/indexerExecution.js"
import { fetchBlockTimestamps } from "../../utils/getLastBlock.js"
import { getAddressesJson } from "../../utils/jsonReader.js"

dotenv.config()

async function main() {
  const {
    providers,
    handleError,
    prismaClient,
    indexerExecutionLogService,
    telegramNotifierService,
    userMarketService,
    userPointsService,
    marketCreationService,
    blockService,
    activeBorrowersService,
    voteEnventService,
    blockRepository,
    savingAccountService,
    predepositService,
    setTransaction,
    addresses,
  } = await setUpIndexerBlockServices()

  try {
    await indexerExecutionLogService.run(INDEXER_EXECUTION_NAMES.BLOCK, async () => {
      const blockInfo = await blockService.getIndexerBlockInfo(providers)
      if (blockInfo === false) {
        console.log("Nothing to index")
        return
      }

      const { startBlock, endBlock, actualBlock, bestProvider, bestProviderIndex } = blockInfo

      if (startBlock && endBlock) {
        const currentBlock = await bestProvider.getBlockNumber()

        console.log(`indexing : ${startBlock} <-----------------> ${endBlock} (current: ${currentBlock} rpc#${bestProviderIndex})`)
        await prismaClient.$transaction(
          async (dbTransaction) => {
            // Set the database transaction to the repositories
            setTransaction(dbTransaction as TransactionPrisma)
            // Detect new markets
            await marketCreationService.runDetection(bestProvider, startBlock, endBlock)

            const { marketAddresses, mapMarketIdAddresses } = await marketCreationService.getMarketsAddressesAndMap()

            // Fetch all User market logs
            const logs = await getEthLogs(bestProvider, startBlock, endBlock, marketAddresses, [])

            const transferToWatch = await userPointsService.getERC20ToTrack()

            await voteEnventService.runDetection(bestProvider, startBlock, endBlock)

            // Call fetchTransferLogs with the addresses
            if (!transferToWatch?.length) {
              throw new Error("ERC20 to track is not filled")
            }
            const transferLogs = await fetchTransferLogs(bestProvider, startBlock, endBlock, transferToWatch)

            const savingAccountsLogs = await getSavingAccountLogs(bestProvider, startBlock, endBlock, [
              addresses.tokens.sUSG,
              // addresses.tokens.sTAN
            ])
            const savingAccountsBlockIds = savingAccountsLogs.map((log) => log.block_id)
            // Parse events with their proper topics and group all user events to update active borrowers
            const { activeBorrowActions, sortedAndParsedEvents, blockIds, users, debtSharesCheckpoints } = userMarketService.sortUserMarketLogs(
              logs,
              mapMarketIdAddresses
            )
            // Recomposer transfer events for debt tasks
            const debtTransferEvents = await userPointsService.recomposeDebtTransferEvents(users, debtSharesCheckpoints)

            const { transferEvents, pointsEventsBlockIds } = userPointsService.sortPointsActionsLogs(transferLogs)

            const usgLps = await predepositService.getUsgLpKeys()
            const { addLiquidityEvents, addLiquEventsBlockIds } = userPointsService.parseAddLiquidity(transferLogs, usgLps)

            // Create a set with all block ID that we need to get the timestamp of
            const uniqueBlockIds = [
              ...new Set([...blockIds, ...pointsEventsBlockIds, ...savingAccountsBlockIds, ...addLiquEventsBlockIds, "0x" + endBlock.toString(16)]),
            ]

            // Find block timestamps of the unique blockIDs in ONE RPC call
            const blocks = await fetchBlockTimestamps(uniqueBlockIds, indexerConfig.provider.chainRpc[bestProviderIndex])

            const hydratedWithCorrectDates = userMarketService.replaceRightDates(sortedAndParsedEvents, activeBorrowActions, blocks)

            const mergedTransferEvents = transferEvents.concat(debtTransferEvents)
            const transferEventsRightDates = userPointsService.replaceDates<Prisma.transfer_eventsCreateManyInput>(mergedTransferEvents, blocks)

            const addLiquidityEventsRightDates = userPointsService.replaceDates<Prisma.add_liquidity_eventsCreateManyInput>(addLiquidityEvents, blocks)

            // Insert user points actions
            await userPointsService.insertEvents(transferEventsRightDates, addLiquidityEventsRightDates)

            // Insert user events
            await userMarketService.insertEvents(hydratedWithCorrectDates.sortedParsedEvents)

            // Update active borrowers
            await activeBorrowersService.updateActiveBorrowers(hydratedWithCorrectDates.userActions)

            // Save saving account events
            await savingAccountService.saveSavingAccountEvents(savingAccountsLogs, blocks)

            // Update the last indexed block
            await blockRepository.storeEventBlock(endBlock, new Date(blocks.get(endBlock)! * 1000))
          },
          {
            timeout: 10_000_000,
          }
        )
      } else {
        console.log("Nothing to index, Current block:", actualBlock)
      }
    })
  } catch (e: any) {
    await telegramNotifierService.sendError(`Error on INDEXER BLOCK  \`\`\` ${e.toString()} \`\`\``)
    handleError(e)
  }
}

main().then()

async function setUpIndexerBlockServices() {
  const { providers, handleError } = setUpIndexer()

  const prismaClient = new PrismaClient()
  // Setup the repositories
  const blockRepository = new BlockRepository(prismaClient)
  const marketContractsRepository = new MarketContractsRepository(prismaClient)
  const userEventsRepository = new UserEventsRepository(prismaClient)
  const userPointsLPRepository = new UserPointsLPRepository(prismaClient)
  const activeBorrowersRepository = new ActiveBorrowersRepository(prismaClient)
  const userPointsVoteRepository = new UserPointsVoteRepository(prismaClient)
  const erc20Repository = new ERC20Repository(prismaClient)
  const savingAccountRepository = new SavingAccountRepository(prismaClient)
  const predepositRepository = new PredepositCampaignRepository(prismaClient)

  const setTransaction = (dbTransaction: TransactionPrisma): void => {
    blockRepository.setClient(dbTransaction)
    marketContractsRepository.setClient(dbTransaction)
    userEventsRepository.setClient(dbTransaction)
    userPointsLPRepository.setClient(dbTransaction)
    activeBorrowersRepository.setClient(dbTransaction)
    userPointsVoteRepository.setClient(dbTransaction)
    erc20Repository.setClient(dbTransaction)
    savingAccountRepository.setClient(dbTransaction)
    predepositRepository.setClient(dbTransaction)
  }

  const addresses = await getAddressesJson()
  // Set up the services
  const blockService = new BlockService(blockRepository)
  const marketCreationService = new MarketCreationService(marketContractsRepository, addresses.utilities.marketCreator, userPointsLPRepository, erc20Repository)

  const userMarketService = new UserMarketService(userEventsRepository)
  const userPointsService = new UserPointsService(userPointsLPRepository, erc20Repository, activeBorrowersRepository)
  const activeBorrowersService = new ActiveBorrowersService(activeBorrowersRepository)
  const voteEnventService = new VotesEventService(userPointsVoteRepository)
  const savingAccountService = new SavingAccountServices(savingAccountRepository, providers[0])
  const predepositService = new PredepositCampaignService(predepositRepository, blockRepository)
  const indexerExecutionLogService = IndexerExecutionLogService.fromClient(prismaClient)

  const telegramNotifierService = new TelegramNotifierService({
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
  })

  return {
    prismaClient,
    indexerExecutionLogService,
    marketCreationService,
    telegramNotifierService,
    userEventsRepository,
    userMarketService,
    userPointsService,
    blockService,
    voteEnventService,
    activeBorrowersService,
    setTransaction,
    marketContractsRepository,
    blockRepository,
    savingAccountService,
    predepositService,
    addresses,
    handleError,
    providers,
  }
}
