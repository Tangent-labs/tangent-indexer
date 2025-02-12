import { BaseContract, JsonRpcProvider, Network } from "ethers"
import { delay } from "./time"
import * as Sentry from "@sentry/node"

import { SENTRY_TAGS } from "../config"
import { indexerConfig } from "../config/indexer_config"

// type JsonRpcProviderMethodNames = {
//     [K in keyof JsonRpcProvider]: JsonRpcProvider[K] extends (...args: any[]) => any ? K : never;
// }[keyof JsonRpcProvider];

// type JsonRpcProviderMethods = {
//     [K in JsonRpcProviderMethodNames]: JsonRpcProvider[K] extends (...args: any[]) => any ? JsonRpcProvider[K] : never;
// };

type ContractMethodNames<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never
}[keyof T]

type ContractMethods<T> = {
  [K in ContractMethodNames<T>]: T[K] extends (...args: any[]) => any ? T[K] : never
}

// create network if chain ID is not well-known (such as for localhost)
const network = Network.from(parseInt(process.env.CHAIN_ID || "1"))

export class RetryProvider {
  private provider: JsonRpcProvider
  private fallbackProvider?: JsonRpcProvider
  private isUsingFallback: boolean = false
  private providerResetTimeout? = indexerConfig.provider.timeOutMs as unknown as NodeJS.Timeout

  constructor() {
    // define as static network so ethers doesn't try to detect network with interval
    this.provider = new JsonRpcProvider(indexerConfig.provider.chainRpc, network, { staticNetwork: true })
    // if we have a correct config of fallback rpc, we create a fallback provider
    if (indexerConfig.provider.fallbackRpc && indexerConfig.provider.fallbackRpc !== indexerConfig.provider.chainRpc) {
      this.fallbackProvider = new JsonRpcProvider(indexerConfig.provider.fallbackRpc, network, { staticNetwork: true })
    }
  }

  getCurrentProvider = (): JsonRpcProvider => {
    return this.isUsingFallback ? this.fallbackProvider! : this.provider
  }

  /**
   * Attempts to call a contract method with automatic retries and fallback switching.
   */
  async contractCall<T extends BaseContract, K extends ContractMethodNames<T>>(
    contract: T,
    method: K,
    params: Parameters<ContractMethods<T>[K]> = [] as unknown as Parameters<ContractMethods<T>[K]>
  ): Promise<Awaited<ReturnType<ContractMethods<T>[K]>>> {
    const func: () => Promise<Awaited<ReturnType<ContractMethods<T>[K]>>> = async () => {
      const connectedContract =
        this.isUsingFallback && this.fallbackProvider ? (contract.connect(this.fallbackProvider) as T) : (contract.connect(this.provider) as T)

      return await (connectedContract[method] as any)(...params)
    }

    return await this.attemptProviderCall(func, method as string, params)
  }

  /**
   * Handles provider method calls with retry logic and provider switching.
   */
  private async attemptProviderCall<T>(callFn: () => Promise<T>, method: string, params: any[]): Promise<T> {
    let retries = 0
    while (retries < indexerConfig.provider.maxRetries) {
      try {
        return await callFn()
      } catch (error) {
        this.handleError(error, method, params)
        await this.switchProvider()
      } finally {
        retries++
      }
      await delay(indexerConfig.provider.switchRpcTimeoutMs)
    }
    throw new Error(`Provider call failed after ${indexerConfig.provider.maxRetries} attempts.`)
  }

  /**
   * Logs the error and captures it in Sentry.
   */
  private handleError(error: any, method: string, params: any[]) {
    Sentry.captureException(error, {
      extra: { provider: this.provider._getConnection().url, method, params },
      tags: { type: SENTRY_TAGS.RETRY_PROVIDER_CALL },
    })
  }

  // Error code list https://support.quicknode.com/hc/en-us/articles/18106039481745-EVM-RPC-Error-Reference

  /**
   * Switches to the fallback provider and resets back to the main provider after a timeout.
   */
  private async switchProvider() {
    if (!this.fallbackProvider) return

    this.isUsingFallback = !this.isUsingFallback
    this.provider = this.isUsingFallback ? this.fallbackProvider : new JsonRpcProvider(indexerConfig.provider.chainRpc, network, { staticNetwork: true })

    if (this.providerResetTimeout) clearTimeout(this.providerResetTimeout)

    this.providerResetTimeout = setTimeout(() => {
      this.isUsingFallback = false
      this.provider = new JsonRpcProvider(indexerConfig.provider.chainRpc, network, { staticNetwork: true })
    }, indexerConfig.provider.switchRpcTimeoutMs)
  }
}
