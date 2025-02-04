import { BlockRepository } from '../db/BlockRepository';

export class BlockService {
    blockRepository: BlockRepository;

    constructor(blockRepository: BlockRepository) {
        this.blockRepository = blockRepository;
    }

    async updateLastBlockIndexed(blockId: number) {
        await this.blockRepository.storeBlockTracking(blockId);
    }

    async getLastBlockIndexed() {
        const blocks = await this.blockRepository.getLastBlockIndexed();
        return !blocks ? Number(process.env.LAST_BLOCK_INDEXED) : blocks.block_id;
    }
}
