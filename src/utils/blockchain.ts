import { JsonRpcProvider } from 'ethers';
import { RetryProvider } from './RetryProvider';
const LOCAL_RPC = 'http://127.0.0.1:8545';

export const getBlockTimestamp = async (provider: JsonRpcProvider, blockTag: number | string) => {
    let block;
    if (process.env.CHAIN_RPC === LOCAL_RPC) {
        while (block == undefined) {
            block = await provider.getBlock(blockTag);
        }
    } else {
        block = await RetryProvider.call(provider, 'getBlock', [blockTag, false]);
    }
    return block!.timestamp;
};
export const getTransactionFromEvent = async (provider: JsonRpcProvider, txHash: string) => {
    let tx;
    if (process.env.CHAIN_RPC === LOCAL_RPC) {
        while (tx == undefined) {
            tx = await provider.getTransaction(txHash);
        }
    } else {
        tx = await RetryProvider.call(provider, 'getTransaction', [txHash]);
    }
    return tx;
};
