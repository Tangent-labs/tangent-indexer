import "dotenv/config"
import { JsonRpcProvider, Network } from "ethers"
import * as Sentry from "@sentry/node"
import { ProfilingIntegration } from "@sentry/profiling-node"
import { PrismaClient } from "@prisma/client"

import { BlockRepository } from "../db/BlockRepository"
import { BlockService } from "../services/BlockService"
import { RetryProvider } from "../utils/RetryProvider"
import { indexerConfig } from "./indexer_config"
import { MarketCreationService } from "../services/MarketCreationService"
import { MarketBorrowerService } from "../services/MarketBorrowerService"
import { MarketContractsRepository } from "../db/MarketContractsRepository"
import { MarketBorrowerRepository } from "../db/MarketBorrowerRepository"
import { TransactionPrisma } from "type/prisma"

export type setUpIndexerType = {
  provider: JsonRpcProvider
  fallbackProvider?: JsonRpcProvider
  retryProvider: RetryProvider
  handleError: (e: Error) => void
}

export function setUpIndexerServices() {
  const prismaClient = new PrismaClient()
  // Setup the repositories
  const blockRepository = new BlockRepository(prismaClient)
  const marketContractsRepository = new MarketContractsRepository(prismaClient)
  const marketBorrowerRepository = new MarketBorrowerRepository(prismaClient)
  const setTransation = (dbTransaction: TransactionPrisma): void => {
    blockRepository.setClient(dbTransaction)
    marketContractsRepository.setClient(dbTransaction)
    marketBorrowerRepository.setClient(dbTransaction)
  }

  // set up the services
  const blockService = new BlockService(blockRepository)
  const marketCreationService = new MarketCreationService(marketContractsRepository)
  const marketBorrowerService = new MarketBorrowerService(marketBorrowerRepository, marketCreationService.marketContractsRepository)

  return {
    prismaClient,
    marketCreationService,
    marketBorrowerService,
    blockService,
    setTransation,
  }
}

export function setUpIndexer(): setUpIndexerType {
  const {
    sentry: { dsn: sentrySdn },
  } = indexerConfig

  const handleError = _intSentry(sentrySdn)

  const { provider, fallbackProvider } = _initNetwork()
  return {
    provider,
    fallbackProvider,
    retryProvider: new RetryProvider(),
    handleError,
  }
}

function _initNetwork() {
  const {
    provider: { chainId, chainRpc, fallbackRpc },
  } = indexerConfig
  const network = Network.from(parseInt(chainId))
  const provider = new JsonRpcProvider(chainRpc, network, { staticNetwork: true, batchMaxSize: 1 })
  const fallbackProvider = fallbackRpc ? new JsonRpcProvider(fallbackRpc, network, { staticNetwork: true, batchMaxSize: 1 }) : undefined
  return { provider, fallbackProvider }
}

function _intSentry(sentrySdn: string): (e: Error) => void {
  if (!indexerConfig.sentry.dsn) {
    return (e: Error) => console.error(e)
  }
  Sentry.init({
    dsn: sentrySdn,
    integrations: [new ProfilingIntegration()],
    // Performance Monitoring
    tracesSampleRate: 1.0, //  Capture 100% of the transactions
    // Set sampling rate for profiling - this is relative to tracesSampleRate
    profilesSampleRate: 1.0,
  })

  return (e: Error) => {
    Sentry.captureException(e)
  }
}
