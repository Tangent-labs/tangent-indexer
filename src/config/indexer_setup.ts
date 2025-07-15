import "dotenv/config"
import { JsonRpcProvider, Network } from "ethers"
import * as Sentry from "@sentry/node"
// import { ProfilingIntegration } from "@sentry/profiling-node"
import { indexerConfig } from "./indexer_config"

export type setUpIndexerType = {
  providers: JsonRpcProvider[]
  walletsPks: string[]
  handleError: (e: Error) => void
}

export function setUpIndexer(): setUpIndexerType {
  const {
    sentry: { dsn: sentrySdn },
  } = indexerConfig

  const handleError = _intSentry(sentrySdn)

  const { providers } = _initNetwork()
  return {
    providers,
    walletsPks: indexerConfig.walletsPk,
    handleError,
  }
}

function _initNetwork() {
  const {
    provider: { chainId, chainRpc },
  } = indexerConfig
  const network = Network.from(parseInt(chainId))
  const providers = chainRpc.map((rpc) => new JsonRpcProvider(rpc, network, { staticNetwork: true, batchMaxSize: 1 }))

  return { providers }
}

function _intSentry(sentrySdn: string): (e: Error) => void {
  if (!indexerConfig.sentry.dsn) {
    return (e: Error) => console.error(e)
  }
  Sentry.init({
    dsn: sentrySdn,
    // Performance Monitoring
    tracesSampleRate: 1.0, //  Capture 100% of the transactions
    // Set sampling rate for profiling - this is relative to tracesSampleRate
    profilesSampleRate: 1.0,
  })

  return (e: Error) => {
    Sentry.captureException(e)
  }
}
