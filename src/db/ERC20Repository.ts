import { AbstractRepository } from "./AbstractRepository.js"

export class ERC20Repository extends AbstractRepository {
    async getTrackedERC20In(erc20Names: string[]) {
        return await this.prismaClient.tracked_erc20.findMany({
            where: {
                name: {
                    in: erc20Names,
                },
            },
        })
    }

    getERC20ToTrack = async () => {
        const tokens = await this.prismaClient.tracked_erc20.findMany({
            select: { address: true },
        })
        const transferToWatch: string[] = tokens.map((token) => token.address)
        return transferToWatch
    }
}
