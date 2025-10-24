import { PrismaClient } from "@prisma/client"
import * as dotenv from "dotenv"
import { JsonRpcProvider } from "ethers"

import { MarketGlobalDataRepository } from "../db/MarketGlobalDataRepository.js"
import { TotalSupplyRepository } from "../db/TotalSupplyRepository.js"
import { GlobalMarketDataService } from "../services/globalData/GlobalMarketDataService.js"
import { PriceApiService } from "../services/PriceApiService.js"
import { TransactionPrisma } from "../type/prisma.js"
import { MarketContractsRepository } from "../db/MarketContractsRepository.js"
import { ERC20Repository } from "../db/ERC20Repository.js"
import { SavingAccountRepository } from "../db/SavingAccountRepository.js"
import { SavingAccountServices } from "../services/events/SavingAccountServices.js"
import { getAddressesJson } from "../utils/jsonReader.js"

dotenv.config()

const NEW_ROWS_FREQUENCY = 900_000

async function main() {
  const { prismaClient, setTransaction, globalDataService, marketGlobalDataRepo, totalSupplyRepo, savingAccountService } = setUpIndexerGlobalData()

  await prismaClient
    .$transaction(
      async (dbTransaction: TransactionPrisma) => {
        setTransaction(dbTransaction)
        const { marketsData, totalSupplies, now } = await globalDataService.computeAprTvlsAndTotalSupplies()
        const lastUpdateTimeMarkets = await marketGlobalDataRepo.fetchLastExecutionTime()
        const lastUpdateTimeTotalSupplies = await totalSupplyRepo.fetchLastExecutionTime()

        if (lastUpdateTimeMarkets && lastUpdateTimeMarkets.getTime() + NEW_ROWS_FREQUENCY > now.getTime()) {
          await marketGlobalDataRepo.updateRows(marketsData, lastUpdateTimeMarkets)
        } else {
          await marketGlobalDataRepo.insertRows(marketsData)
        }
        await marketGlobalDataRepo.wipeAndInsertLatestDataRows(marketsData)

        if (lastUpdateTimeTotalSupplies && lastUpdateTimeTotalSupplies.getTime() + NEW_ROWS_FREQUENCY > now.getTime()) {
          await totalSupplyRepo.updateRows(totalSupplies, lastUpdateTimeTotalSupplies)
        } else {
          await totalSupplyRepo.insertRows(totalSupplies)
        }
      },
      {
        timeout: 10_000_000,
      }
    )
    .then((_) => {})
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
        await savingAccountService.processSavingAccountApy(marketGlobalDataRepo, sTAN, sUSG)
      },
      {
        timeout: 10_000_000,
      }
    )
    .then((_) => {})
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
  const marketGlobalDataRepo = new MarketGlobalDataRepository(prismaClient)
  const savingAccountRepository = new SavingAccountRepository(prismaClient)

  const setTransaction = (dbTransaction: TransactionPrisma): void => {
    erc20Repository.setClient(dbTransaction)
    marketContractsRepository.setClient(dbTransaction)
    marketGlobalDataRepo.setClient(dbTransaction)
    totalSupplyRepo.setClient(dbTransaction)
    savingAccountRepository.setClient(dbTransaction)
  }

  const priceApiService = new PriceApiService()
  const globalDataService = new GlobalMarketDataService(provider, priceApiService, erc20Repository, marketContractsRepository)
  const totalSupplyRepo = new TotalSupplyRepository(prismaClient)
  const savingAccountService = new SavingAccountServices(savingAccountRepository)
  return {
    prismaClient,
    globalDataService,
    savingAccountService,
    totalSupplyRepo,
    marketGlobalDataRepo,
    setTransaction,
  }
}

main()
