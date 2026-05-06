import { Wallet } from "ethers"
import { ActiveBorrowersRepository } from "../db/ActiveBorrowersRepository.js"
import { BlockRepository } from "../db/BlockRepository.js"
import { getBestRpcProvider } from "../utils/getBestRpcProvider.js"
import { LiquidationExecutionContext } from "./LiquidationExecutionContext.js"

export class LiquidationContextService {
  minEthBalance: number = 0.1
  private activeBorrowersRepository: ActiveBorrowersRepository
  private context: LiquidationExecutionContext

  constructor(activeBorrowersRepository: ActiveBorrowersRepository, context: LiquidationExecutionContext) {
    this.activeBorrowersRepository = activeBorrowersRepository
    this.context = context
  }

  async checkContext() {
    const providers = this.context.providers

    const blockRepository = new BlockRepository(null!)
    blockRepository.setClient(this.activeBorrowersRepository.prismaClient)

    try {
      await blockRepository.getLastEventBlock()
      this.context.isDbAlive = true
    } catch (error) {
      this.context.isDbAlive = false
    }

    const bestRpc = await getBestRpcProvider(providers)
    const provider = providers[bestRpc.index]

    const walletBalanceChecks = await Promise.all(
      this.context.walletsPks.map(async (pk) => {
        const signer = new Wallet(pk, provider)
        const address = await signer.getAddress()
        const balance = await provider.getBalance(address)
        return {
          pk,
          balance,
          hasSufficientBalance: balance > BigInt(this.minEthBalance * 10 ** 18),
        }
      })
    )

    this.context.walletsPks = walletBalanceChecks.filter((check) => check.hasSufficientBalance).map((check) => check.pk)
  }
}
