import { commonERC20 } from 'convergence-defi-tools';

export const DEFAULT_INTERVAL_MS = 6000; // 60s

export const TOKEN_BOND_STABLE = [commonERC20.USDC, commonERC20.DAI, commonERC20.FRAX, commonERC20.crvUSD];

export const SENTRY_TAGS = {
    RETRY_PROVIDER_CALL: 'retry-provider-call',
    RETRY_PROVIDER_CONTRACT_CALL: 'retry-provider-contract-call',
    CHAIN_VIEW: 'chain-view',
};

export const MULTICALL_ADDRESS = '0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696';
