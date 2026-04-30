import { PrismaClient } from "@prisma/client"
import * as dotenv from "dotenv"

import { ActiveBorrowersRepository } from "../../db/ActiveBorrowersRepository.js"
import { LiquidationBotLogRepository } from "../../db/LiquidationBotLogRepository.js"
import { PositionSnapshotRepository } from "../../db/PositionSnapshotRepository.js"
import { MarketConfigRepository } from "../../db/MarketConfigRepository.js"
import { MarketContractsRepository } from "../../db/MarketContractsRepository.js"

import { LiquidationBotLogService } from "../../services/LiquidationBotLogService.js"
import { LiquidationCheckService } from "../../services/LiquidationCheckService.js"
import { LiquidationCheckRunner } from "../../services/LiquidationCheckRunner.js"
import { LiquidationContextService } from "../../services/LiquidationContextService.js"

import { indexerConfig } from "../../config/indexer_config.js"
import { liquidationConfig } from "../../config/liquidation_config.js"
import { LiquidationExecutionContext } from "../../services/LiquidationExecutionContext.js"
import { setUpIndexer } from "../../config/indexer_setup.js"
import { TelegramNotifierService } from "../../services/TelegramNotificationServices.js"
import { getAddressesJson } from "../../utils/jsonReader.js"
import { getLiquidatorWalletPks } from "../../config/liquidation_wallets.js"

dotenv.config()
const { providers, handleError } = setUpIndexer()
const walletsPks = getLiquidatorWalletPks()
const { liquidationCheckService, liquidationContextService, context, liquidationBotService, telegramNotifierService, prismaClient } =
  await setUpCheckLiquidationServices()

// Run main function if this file is being run directly
if (process.env.NODE_ENV !== "test") {
  const positionSnapshotRepository = new PositionSnapshotRepository(prismaClient)
  const marketConfigRepository = new MarketConfigRepository(prismaClient)
  const marketContractsRepository = new MarketContractsRepository(prismaClient)
  const checkLiquidationService = new LiquidationCheckRunner(
    liquidationCheckService,
    liquidationContextService,
    context,
    liquidationBotService,
    telegramNotifierService,
    providers,
    positionSnapshotRepository,
    marketConfigRepository,
    marketContractsRepository
  )
  const marketViewerAddress = (await getAddressesJson()).utilities.marketViewer
  checkLiquidationService.marketViewerAddress = marketViewerAddress
  let exitCode = 0

  checkLiquidationService
    .run()
    .then(() => {
      console.log("Done")
      // Queue is already closed in the run() method's finally block
    })
    .catch((error) => {
      handleError(error)
      exitCode = 1
      // Ensure queue is closed even on error
      return checkLiquidationService.close().catch(() => {
        // Ignore errors when closing queue
      })
    })
    .finally(async () => {
      // Close Prisma connection
      await prismaClient.$disconnect()
      process.exit(exitCode)
    })
}

export async function setUpCheckLiquidationServices() {
  const prismaClient = new PrismaClient()

  const context = new LiquidationExecutionContext()
  context.providers = providers
  context.walletsPks = walletsPks
  const telegramNotifierService = new TelegramNotifierService({
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
  })

  if (!liquidationConfig.enso.apiKey) {
    await telegramNotifierService.sendError("⚠️ ENSO_API_KEY is not set — Enso routing disabled, falling back to Curve/Pendle only.")
  }

  const liquidationBotLogRepository = new LiquidationBotLogRepository(prismaClient)
  const liquidationBotService = new LiquidationBotLogService(liquidationBotLogRepository, telegramNotifierService)

  const activeBorrowersRepository = new ActiveBorrowersRepository(prismaClient)
  const liquidationCheckService = new LiquidationCheckService(activeBorrowersRepository, context)
  const liquidationContextService = new LiquidationContextService(activeBorrowersRepository, context)
  liquidationContextService.minEthBalance = indexerConfig.minEthBalance

  return {
    liquidationCheckService,
    liquidationContextService,
    context,
    liquidationBotService,
    telegramNotifierService,
    prismaClient,
  }
}
