import 'dotenv/config';
import { JsonRpcProvider, Network } from 'ethers';
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

import * as contractRegistry from '../contractRegistry.json';

// TYPECHAIN
import {
    BondDepositoryV1__factory,
    BondDepositoryV2__factory,
    CloneFactoryV2__factory,
    GaugeController__factory,
    IERC20__factory,
    LockingPositionService__factory,
    SdtStakingPositionService__factory,
} from './typechain';
import { PrismaClient } from '@prisma/client';
import { BondService } from './services/BondService';
import { RetryProvider } from './utils/RetryProvider';
import { TransactionPrisma } from 'types/prisma';

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
const contractFormatter = new ContractFormatter(provider);
const bondFormatter = new BondFormatter(provider);
const lockingFormatter = new LockingFormatter(provider);
const gaugeFormatter = new GaugeFormatter(provider);
const stakingFormatter = new StakingFormatter(provider);

// Repositories
const contractsRepository = new ContractRepository(prismaClient);
const gaugeRepository = new GaugeRepository(prismaClient);
const bondRepository = new BondRepository(prismaClient);
const blockRepository = new BlockRepository(prismaClient);
const cycleRepository = new CyclesRepository(prismaClient);
const rewardRepository = new RewardRepository(prismaClient);
const transferRepository = new TransferEventRepository(prismaClient);
const lockingRepository = new LockingRepository(prismaClient);
const stakingRepository = new StakingRepository(prismaClient);

// Contracts

// Services
const controlTowerService = new ControlTowerService(provider, contractsRepository);
const blockService = new BlockService(blockRepository);

const eventService = new TransferEventService(provider, contractsRepository, transferRepository);

async function main() {
    // Fetch contract to database OR create database from CvgControlTower blockchain fetching
    await controlTowerService.initialize();

    const cloneFactoryV2Contract = CloneFactoryV2__factory.connect(contractRegistry.global.CloneFactory, provider);
    const gaugeControllerContract = GaugeController__factory.connect(contractRegistry.global.GaugeController, provider);

    const bondDepositoryContract = BondDepositoryV1__factory.connect(contractRegistry.global.BondDepository, provider);
    const bondDepositoryV2Contract = BondDepositoryV2__factory.connect(contractRegistry.global.BondDepository, provider);

    const lockingPositionServiceContract = LockingPositionService__factory.connect(
        contractRegistry.global.LockingPositionService,
        provider
    );

    const cvgSdtContract = IERC20__factory.connect(contractRegistry.stakeDao.cvgSDT, provider);
    const cvgSdtStakingContract = SdtStakingPositionService__factory.connect(contractRegistry.stakeDao.cvgSdtStaking, provider);

    const cloneFactoryService = new CloneFactoryService(contractsRepository, contractFormatter, cloneFactoryV2Contract);
    const gaugeService = new GaugeService(provider, gaugeFormatter, gaugeRepository, gaugeControllerContract, lockingRepository);
    const bondService = new BondService(bondRepository, bondFormatter, bondDepositoryContract, bondDepositoryV2Contract);
    const lockingService = new LockingService(lockingFormatter, lockingRepository, lockingPositionServiceContract);
    const stakingService = new StakingService(
        provider,
        stakingFormatter,
        stakingRepository,
        contractsRepository,
        cvgSdtContract,
        cvgSdtStakingContract
    );
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
                contractsRepository.setClient(tx);
                bondRepository.setClient(tx);
                blockRepository.setClient(tx);
                rewardRepository.setClient(tx);
                cycleRepository.setClient(tx);
                gaugeRepository.setClient(tx);
                lockingRepository.setClient(tx);

                await cloneFactoryService.mainProcess(blockFrom, newLastIndexedBlock);
                await bondService.mainProcess(blockFrom, newLastIndexedBlock);

                await eventService.mainProcess(blockFrom, newLastIndexedBlock);
                await lockingService.mainProcess(blockFrom, newLastIndexedBlock);
                await stakingService.mainProcess(blockFrom, newLastIndexedBlock);
                await gaugeService.mainProcess(blockFrom, newLastIndexedBlock);

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
