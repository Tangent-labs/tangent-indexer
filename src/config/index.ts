import { commonERC20 } from 'convergence-defi-tools';

export const DEFAULT_INTERVAL_MS = 6000; // 60s

export const SENTRY_TAGS = {
    RETRY_PROVIDER_CALL: 'retry-provider-call',
    RETRY_PROVIDER_CONTRACT_CALL: 'retry-provider-contract-call',
    CHAIN_VIEW: 'chain-view',
};
