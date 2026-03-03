import { PrismaClient } from "@prisma/client"
import * as dotenv from "dotenv"
import { JsonRpcProvider } from "ethers"

import { GlobalDataRepository } from "../../db/GlobalDataRepository.js"
import { TotalSupplyRepository } from "../../db/TotalSupplyRepository.js"
import { GlobalDataService } from "../../services/globalData/GlobalDataService.js"
import { CallApiService } from "../../services/CallApiService.js"
import { TransactionPrisma } from "../../type/prisma.js"
import { MarketContractsRepository } from "../../db/MarketContractsRepository.js"
import { ERC20Repository } from "../../db/ERC20Repository.js"
import { SavingAccountRepository } from "../../db/SavingAccountRepository.js"
import { SavingAccountServices } from "../../services/events/SavingAccountServices.js"
import { getAddressesJson } from "../../utils/jsonReader.js"
import { PegKeeperRepository } from "../../db/PegKeepeerRepository.js"
import { WStableRepository } from "../../db/WStableRepository.js"
import { GlobalHistoryDataRepository } from "../../db/GlobalHistoryDataRepository.js"
import { PegMonitoredTokenRepository } from "../../db/PegMonitoredTokenRepository.js"
import { TelegramNotifierService } from "../../services/TelegramNotificationServices.js"

dotenv.config()

async function main() {
  const { prismaClient, setTransaction, globalDataService, globalDataRepository, savingAccountService, telegramNotifierService } = setUpIndexerGlobalData()

  const nowBC = new Date()

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
    .then((_) => { })
    .catch(async (e) => {
      await telegramNotifierService.sendError(`Error on GLOBAL DATA PROCESS  \`\`\` ${e.toString()} \`\`\``)
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
    .then((_) => { })
    .catch(async (e) => {
      await telegramNotifierService.sendError(`Error on SAVING ACCOUNT APY  \`\`\` ${e.toString()} \`\`\``)

      console.error(e)
    })
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
  const savingAccountService = new SavingAccountServices(savingAccountRepository)
  return {
    prismaClient,
    globalDataService,
    savingAccountService,
    totalSupplyRepo,
    globalDataRepository,
    telegramNotifierService,
    setTransaction,
  }
}

main()
