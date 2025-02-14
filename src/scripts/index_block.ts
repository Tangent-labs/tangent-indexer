import { BlockService } from "../services/BlockService"
import { setUpIndexer, setUpIndexerServices } from "../config/indexer_setup"
import { TransactionPrisma } from "type/prisma"

async function main() {
  const { provider, handleError } = setUpIndexer()
  const { prismaClient, marketBorrowerService, marketCreationService, blockService, setTransation } = setUpIndexerServices()

  try {
    const { startBlock, endBlock, actualBlock } = await BlockService.getIndexerBlockInfo(provider, blockService)
    // If the last block indexed is smaller than the actual =>
    if (startBlock && endBlock) {
      console.log(startBlock, "<----------------->", endBlock)
      await prismaClient.$transaction(
        async (dbTransaction: TransactionPrisma) => {
          // Set the database transaction to the repositories
          setTransation(dbTransaction)

          // Detect  new markets
          await marketCreationService.runDetection(provider, startBlock, endBlock)

          // Detect new borrowers
          await marketBorrowerService.runDetection(provider, startBlock, endBlock)

          // Update the last indexed block
          await blockService.updateLastBlockIndexed(endBlock)
        },
        {
          timeout: 10_000_000,
        }
      )
    } else {
      console.log("Nothing to index, Current block:", actualBlock)
    }
  } catch (e: any) {
    console.error("Error while indexing blocks", (e as Error).message)
    handleError(e as Error)
  }
}

main().then(() => console.log("Block indexation updated"))
