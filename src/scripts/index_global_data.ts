import { PrismaClient } from "@prisma/client"
import * as dotenv from "dotenv"
import { JsonRpcProvider } from "ethers"

import { GlobalDataRepository } from "../db/GlobalDataRepository.js"
import { TotalSupplyRepository } from "../db/TotalSupplyRepository.js"
import { GlobalDataService } from "../services/globalData/GlobalDataService.js"
import { CallApiService } from "../services/CallApiService.js"
import { TransactionPrisma } from "../type/prisma.js"
import { MarketContractsRepository } from "../db/MarketContractsRepository.js"
import { ERC20Repository } from "../db/ERC20Repository.js"
import { SavingAccountRepository } from "../db/SavingAccountRepository.js"
import { SavingAccountServices } from "../services/events/SavingAccountServices.js"
import { getAddressesJson } from "../utils/jsonReader.js"

dotenv.config()

const NEW_ROWS_FREQUENCY = 900_000

async function main() {
  const { prismaClient, setTransaction, globalDataService, globalDataRepository, totalSupplyRepo, savingAccountService } = setUpIndexerGlobalData()

  let nowBC = new Date()

  await prismaClient
    .$transaction(
      async (dbTransaction: TransactionPrisma) => {
        setTransaction(dbTransaction)
        const { marketsData, totalSupplies, keepersSnapshot, wStableSnapshot, usgGlobalInfos } = await globalDataService.computeAprTvlsAndTotalSupplies()
        const nowBC = new Date(usgGlobalInfos.date)
        const lastUpdateTimeMarkets = await globalDataRepository.fetchLastExecutionTime()
        const lastUpdateTimeTotalSupplies = await totalSupplyRepo.fetchLastExecutionTime()

        if (lastUpdateTimeMarkets && lastUpdateTimeMarkets.getTime() + NEW_ROWS_FREQUENCY > nowBC.getTime()) {
          await globalDataRepository.updateRows(marketsData, lastUpdateTimeMarkets)
        } else {
          await globalDataRepository.insertRows(marketsData)
        }
        await globalDataRepository.wipeAndInsertLatestDataRows(marketsData)

        if (lastUpdateTimeTotalSupplies && lastUpdateTimeTotalSupplies.getTime() + NEW_ROWS_FREQUENCY > nowBC.getTime()) {
          await totalSupplyRepo.updateRows(totalSupplies, lastUpdateTimeTotalSupplies)
        } else {
          await totalSupplyRepo.insertRows(totalSupplies)
        }
      },
      {
        timeout: 10_000_000,
      }
    )
    .then((_) => { })
    .catch((e) => {
      console.error(e)
    })

  await prismaClient
    .$transaction(
      async (dbTransaction: TransactionPrisma) => {
        setTransaction(dbTransaction)
        const {
          tokens: { sTAN, sUSG },
        } = await getAddressesJson()
        await savingAccountService.processSavingAccountApy(globalDataRepository, nowBC, sTAN, sUSG)
      },
      {
        timeout: 10_000_000,
      }
    )
    .then((_) => { })
    .catch((e) => {
      console.error(e)
    })
}

function setUpIndexerGlobalData() {
  const prismaClient = new PrismaClient()
  const chainRpcs = process.env.CHAIN_RPCS
  if (!chainRpcs) {
    throw new Error("CHAIN_RPCS_NOT_SET")
  }
  const provider = new JsonRpcProvider(chainRpcs.split(",")[0])
  const marketContractsRepository = new MarketContractsRepository(prismaClient)
  const erc20Repository = new ERC20Repository(prismaClient)
  const globalDataRepository = new GlobalDataRepository(prismaClient)
  const savingAccountRepository = new SavingAccountRepository(prismaClient)

  const setTransaction = (dbTransaction: TransactionPrisma): void => {
    erc20Repository.setClient(dbTransaction)
    marketContractsRepository.setClient(dbTransaction)
    globalDataRepository.setClient(dbTransaction)
    totalSupplyRepo.setClient(dbTransaction)
    savingAccountRepository.setClient(dbTransaction)
  }

  const callApiService = new CallApiService()
  const globalDataService = new GlobalDataService(provider, callApiService, erc20Repository, globalDataRepository, marketContractsRepository)
  const totalSupplyRepo = new TotalSupplyRepository(prismaClient)
  const savingAccountService = new SavingAccountServices(savingAccountRepository)
  return {
    prismaClient,
    globalDataService,
    savingAccountService,
    totalSupplyRepo,
    globalDataRepository,
    setTransaction,
  }
}

main()
