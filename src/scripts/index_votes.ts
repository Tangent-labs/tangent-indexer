import * as dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"
import { TransactionPrisma } from "type/prisma"
import { setUpIndexer } from "../config/indexer_setup"
import { UserVoteRepository } from "db/UserVoteRepository"
import SnapShotVoteService from "services/SnapShotVoteService"

dotenv.config()

async function main() {
  const { handleError } = setUpIndexer()

  const { prismaClient, snapshotService, setTransaction } = setUpIndexerBlockServices()

  try {
    const now = new Date()
    const endDate = new Date(now.getTime()) // ajd
    const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) // 7 jours avant

    const startTs = Math.floor(startDate.getTime() / 1000)
    const endTs = Math.floor(endDate.getTime() / 1000)

    console.log(`Indexing votes from ${startDate} to ${endDate}`)

    await prismaClient.$transaction(
      async (dbTransaction: TransactionPrisma) => {
        setTransaction(dbTransaction)

        await snapshotService.computeUserVoteTasks(startTs, endTs)
      },
      { timeout: 10_000_000 }
    )
  } catch (e: any) {
    console.error("Error while indexing votes", e.message)
    handleError(e as Error)
  }
}

main().then()

function setUpIndexerBlockServices() {
  const prismaClient = new PrismaClient()
  const userVoteRepository = new UserVoteRepository(prismaClient)

  const setTransaction = (dbTransaction: TransactionPrisma): void => {
    userVoteRepository.setClient(dbTransaction)
  }

  const snapshotService = new SnapShotVoteService(userVoteRepository)

  return {
    prismaClient,
    snapshotService,
    setTransaction,
  }
}
