import { BaseContract, JsonRpcProvider, Network } from 'ethers';
import { delay } from './time';
import * as Sentry from '@sentry/node';
import { SENTRY_TAGS } from '../config';

const MAX_PROVIDER_RETRIES = 2;

type JsonRpcProviderMethodNames = {
    [K in keyof JsonRpcProvider]: JsonRpcProvider[K] extends (...args: any[]) => any ? K : never;
}[keyof JsonRpcProvider];

type JsonRpcProviderMethods = {
    [K in JsonRpcProviderMethodNames]: JsonRpcProvider[K] extends (...args: any[]) => any ? JsonRpcProvider[K] : never;
};

type ContractMethodNames<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

type ContractMethods<T> = {
    [K in ContractMethodNames<T>]: T[K] extends (...args: any[]) => any ? T[K] : never;
};

// create network if chain ID is not well-known (such as for localhost)
const network = Network.from(parseInt(process.env.CHAIN_ID || '1'));

export class RetryProvider {
    // define as static network so ethers doesn't try to detect network with interval
    static fallbackProvider: JsonRpcProvider = new JsonRpcProvider(process.env.FALLBACK_CHAIN_RPC, network, { staticNetwork: true });

    static useFallbackProvider: boolean = false;
    static timeoutProviderSwitch: ReturnType<typeof setTimeout>;

    static async call<T extends JsonRpcProviderMethodNames>(
        provider: JsonRpcProvider,
        method: T,
        params: Parameters<JsonRpcProviderMethods[T]> = [] as Parameters<JsonRpcProviderMethods[T]>
    ): Promise<Awaited<ReturnType<JsonRpcProviderMethods[T]>>> {
        let retries = 0;
        let response;

        while (retries < MAX_PROVIDER_RETRIES && !response) {
            try {
                if (this.useFallbackProvider) {
                    provider = this.fallbackProvider;
                }

                // @ts-ignore
                response = await provider[method](...params);
            } catch (error) {
                Sentry.captureException(error, {
                    extra: { provider: provider._getConnection().url, method, params },
                    tags: {
                        type: SENTRY_TAGS.RETRY_PROVIDER_CALL,
                    },
                });

                this.useFallbackProvider = !this.useFallbackProvider;

                // create timeout to switch back to main provider
                clearTimeout(this.timeoutProviderSwitch);
                this.timeoutProviderSwitch = setTimeout(() => {
                    this.useFallbackProvider = !this.useFallbackProvider;
                }, parseInt(process.env.SWITCH_PROVIDER_MS_TIMEOUT!));

                await delay(150);
            } finally {
                retries++;
            }
        }

        return response;
    }

    static async contractCall<T extends BaseContract, K extends ContractMethodNames<T>>(
        contract: T,
        method: K,
        params: Parameters<ContractMethods<T>[K]> = [] as unknown as Parameters<ContractMethods<T>[K]>
    ): Promise<Awaited<ReturnType<ContractMethods<T>[K]>>> {
        let retries = 0;
        let response;

        while (retries < MAX_PROVIDER_RETRIES && !response) {
            try {
                if (this.useFallbackProvider) {
                    contract = contract.connect(this.fallbackProvider) as T;
                }

                // @ts-ignore
                response = await contract[method](...params);
            } catch (error) {
                Sentry.captureException(error, {
                    extra: { contract, method, params },
                    tags: {
                        type: SENTRY_TAGS.RETRY_PROVIDER_CONTRACT_CALL,
                    },
                });

                this.useFallbackProvider = !this.useFallbackProvider;

                // create timeout to switch back to main provider
                clearTimeout(this.timeoutProviderSwitch);
                this.timeoutProviderSwitch = setTimeout(() => {
                    this.useFallbackProvider = !this.useFallbackProvider;
                }, parseInt(process.env.SWITCH_PROVIDER_MS_TIMEOUT!));

                await delay(150);
            } finally {
                retries++;
            }
        }

        return response;
    }
}
