import { PrismaClient } from "@prisma/client"
import * as dotenv from "dotenv"
import { JsonRpcProvider } from "ethers"

import { ERC20Repository } from "../../db/ERC20Repository.js"
import { GlobalDataRepository } from "../../db/GlobalDataRepository.js"
import { GlobalHistoryDataRepository } from "../../db/GlobalHistoryDataRepository.js"
import { MarketContractsRepository } from "../../db/MarketContractsRepository.js"
import { PegKeeperRepository } from "../../db/PegKeepeerRepository.js"
import { PegMonitoredTokenRepository } from "../../db/PegMonitoredTokenRepository.js"
import { SavingAccountRepository } from "../../db/SavingAccountRepository.js"
import { TotalSupplyRepository } from "../../db/TotalSupplyRepository.js"
import { WStableRepository } from "../../db/WStableRepository.js"
import { CallApiService } from "../../services/CallApiService.js"
import { SavingAccountServices } from "../../services/events/SavingAccountServices.js"
import { GlobalDataService } from "../../services/globalData/GlobalDataService.js"
import { IndexerExecutionLogService } from "../../services/IndexerExecutionLogService.js"
import { TelegramNotifierService } from "../../services/TelegramNotificationServices.js"
import { INDEXER_EXECUTION_NAMES } from "../../type/indexerExecution.js"
import { TransactionPrisma } from "../../type/prisma.js"
import { toSafeErrorMessage } from "../../utils/errors.js"
import { getAddressesJson } from "../../utils/jsonReader.js"

dotenv.config()

async function main() {
  const { prismaClient, setTransaction, globalDataService, globalDataRepository, savingAccountService, telegramNotifierService, indexerExecutionLogService } =
    setUpIndexerGlobalData()

  try {
    await indexerExecutionLogService.run(INDEXER_EXECUTION_NAMES.GLOBAL_DATA, async () => {
      const nowBC = new Date()
      const executionErrors: string[] = []

      await prismaClient
        .$transaction(
          async (dbTransaction) => {
            setTransaction(dbTransaction as TransactionPrisma)
            await globalDataService.globalDataProcess()
          },
          {
            timeout: 10_000_000,
          }
        )
        .catch(async (e) => {
          executionErrors.push(`GLOBAL DATA PROCESS: ${toSafeErrorMessage(e)}`)
          await telegramNotifierService.sendError(`Error on GLOBAL DATA PROCESS: ${toSafeErrorMessage(e)}`)
          console.error(e)
        })

      await prismaClient
        .$transaction(
          async (dbTransaction) => {
            setTransaction(dbTransaction as TransactionPrisma)
            const {
              tokens: { sUSG },
            } = await getAddressesJson()
            await savingAccountService.processSavingAccountApy(globalDataRepository, nowBC, sUSG)
          },
          {
            timeout: 10_000_000,
          }
        )
        .catch(async (e) => {
          executionErrors.push(`SAVING ACCOUNT APY: ${toSafeErrorMessage(e)}`)
          await telegramNotifierService.sendError(`Error on SAVING ACCOUNT APY: ${toSafeErrorMessage(e)}`)

          console.error(e)
        })

      if (executionErrors.length > 0) {
        throw new Error(executionErrors.join(" | "))
      }
    })
  } catch (e) {
    console.error(e)
  }
}

function setUpIndexerGlobalData() {
  const prismaClient = new PrismaClient()
  const chainRpcs = process.env.CHAIN_RPCS
  if (!chainRpcs) {
    throw new Error("CHAIN_RPCS_NOT_SET")
  }

  const telegramNotifierService = new TelegramNotifierService({
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!,
  })
  const provider = new JsonRpcProvider(chainRpcs.split(",")[0])
  const erc20Repository = new ERC20Repository(prismaClient)
  const marketContractsRepository = new MarketContractsRepository(prismaClient)
  const globalDataRepository = new GlobalDataRepository(prismaClient)
  const savingAccountRepository = new SavingAccountRepository(prismaClient)
  const keeperRepository = new PegKeeperRepository(prismaClient)
  const wStableRepository = new WStableRepository(prismaClient)
  const totalSupplyRepository = new TotalSupplyRepository(prismaClient)
  const globalHistoryDataRepository = new GlobalHistoryDataRepository(prismaClient)
  const pegMonitoredTokenRepository = new PegMonitoredTokenRepository(prismaClient)

  const setTransaction = (dbTransaction: TransactionPrisma): void => {
    erc20Repository.setClient(dbTransaction)
    marketContractsRepository.setClient(dbTransaction)
    globalDataRepository.setClient(dbTransaction)
    savingAccountRepository.setClient(dbTransaction)
    keeperRepository.setClient(dbTransaction)
    wStableRepository.setClient(dbTransaction)
    totalSupplyRepository.setClient(dbTransaction)
    globalHistoryDataRepository.setClient(dbTransaction)
    pegMonitoredTokenRepository.setClient(dbTransaction)
  }

  const globalDataService = new GlobalDataService(
    provider,
    new CallApiService(),
    erc20Repository,
    globalDataRepository,
    totalSupplyRepository,
    keeperRepository,
    wStableRepository,
    globalHistoryDataRepository,
    marketContractsRepository,
    pegMonitoredTokenRepository
  )
  const totalSupplyRepo = new TotalSupplyRepository(prismaClient)
  const savingAccountService = new SavingAccountServices(savingAccountRepository, provider)
  const indexerExecutionLogService = IndexerExecutionLogService.fromClient(prismaClient)
  return {
    prismaClient,
    provider,
    globalDataService,
    savingAccountService,
    totalSupplyRepo,
    globalDataRepository,
    telegramNotifierService,
    indexerExecutionLogService,
    setTransaction,
  }
}

main()
