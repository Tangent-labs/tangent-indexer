import "dotenv/config"
import { JsonRpcProvider, Network } from "ethers"
import * as Sentry from "@sentry/node"
import { ProfilingIntegration } from "@sentry/profiling-node"

import { RetryProvider } from "../utils/RetryProvider"
import { indexerConfig } from "./indexer_config"

export type setUpIndexerType = {
  provider: JsonRpcProvider
  fallbackProvider?: JsonRpcProvider
  retryProvider: RetryProvider
  handleError: (e: Error) => void
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
