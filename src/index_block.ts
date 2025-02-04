import 'dotenv/config';
import { JsonRpcProvider, Network } from 'ethers';
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

import * as contractRegistry from '../contractRegistry.json';

// TYPECHAIN

import { PrismaClient } from '@prisma/client';

import { RetryProvider } from './utils/RetryProvider';
import { BlockRepository } from './db/BlockRepository';
import { BlockService } from './services/BlockService';

const prismaClient = new PrismaClient();
const sentrySdn = process.env.SENTRY_SDN;
if (!sentrySdn) {
    throw Sentry.captureException('SENTRY_SDN_NOT_SET');
}

Sentry.init({
    dsn: sentrySdn,
    integrations: [new ProfilingIntegration()],
    // Performance Monitoring
    tracesSampleRate: 1.0, //  Capture 100% of the transactions
    // Set sampling rate for profiling - this is relative to tracesSampleRate
    profilesSampleRate: 1.0,
});

const blockRangeEnv = process.env.INDEXING_BLOCK_RANGE;
if (!blockRangeEnv) {
    throw Sentry.captureException('INDEXING_BLOCK_RANGE_NOT_SET');
}
const blockRange = Number(blockRangeEnv);

const chainId = process.env.CHAIN_ID;
if (!chainId) {
    throw Sentry.captureException('CHAIN_ID_NOT_SET');
}
// define as static network so ethers doesn't try to detect network with interval
const network = Network.from(parseInt(chainId));

const chainRpc = process.env.CHAIN_RPC;
if (!chainRpc) {
    throw Sentry.captureException('CHAIN_RPC_NOT_SET');
}
const provider = new JsonRpcProvider(process.env.CHAIN_RPC, network, { staticNetwork: true, batchMaxSize: 1 });
if (!process.env.LAST_BLOCK_INDEXED) {
    throw Sentry.captureException('LAST_BLOCK_INDEXED_NOT_SET');
}

// Formatter

// Repositories

const blockRepository = new BlockRepository(prismaClient);

// Contracts

// Services
const blockService = new BlockService(blockRepository);

async function main() {
    let newLastIndexedBlock: number;

    // Get last block indexed & actual block
    let actualBlock = await RetryProvider.call(provider, 'getBlockNumber');
    blockRepository.setClient(prismaClient);
    let lastBlockIndexed = Number(await blockService.getLastBlockIndexed());
    // Determine the last block to index on this iteration
    if (lastBlockIndexed + blockRange > actualBlock!) {
        newLastIndexedBlock = actualBlock;
    } else {
        newLastIndexedBlock = lastBlockIndexed + blockRange;
    }

    // If the last block indexed is smaller than the actual =>
    if (lastBlockIndexed < actualBlock) {
        const blockFrom = lastBlockIndexed + 1;
        console.log(blockFrom, '-----------------', newLastIndexedBlock);
        await prismaClient.$transaction(
            async (tx: TransactionPrisma) => {
                // Update in all repository the client as the actual transaction

                blockRepository.setClient(tx);

                // await bondService.mainProcess(blockFrom, newLastIndexedBlock);

                // Update the last block from the range
                await blockService.updateLastBlockIndexed(newLastIndexedBlock);
            },
            {
                timeout: 10_000_000,
            }
        );
    } else {
        console.log('Nothing to index, Current block:', actualBlock);
    }
}

main().then(() => console.log('Block indexation updated'));
