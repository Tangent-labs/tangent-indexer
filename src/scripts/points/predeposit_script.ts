import * as dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"

import { TransactionPrisma } from "../../type/prisma.js"

import { setUpIndexer } from "../../config/indexer_setup.js"
import { TelegramNotifierService } from "../../services/TelegramNotificationServices.js"
import { PredepositCampaignRepository } from "../../db/PredepositCampaignRepository.js"
import { PredepositCampaignService } from "../../services/PredepositCampaignService.js"
import { BlockRepository } from "../../db/BlockRepository.js"
import { getLastBlock } from "../../utils/getLastBlock.js"

dotenv.config()

async function main() {
  const { prismaClient, setTransaction, predepositCampaignService, telegramNotifierService, providers } = setUpPredepositCampaignScript()

  try {
    await prismaClient.$transaction(
      async (dbTransaction: TransactionPrisma) => {
        setTransaction(dbTransaction)

        const { blockNumber, blockDate } = await getLastBlock(providers[0])
        const state = await predepositCampaignService.getPredepositState()

        if (state === "finished") {
          return
        }
        const isPrivate = state === "deposit_private"
        // Increase accounted total and balances by reading `AddLiquidity` events stored in db by indexer-block
        // Only done in deposit states
        if (state !== "retention") {
          await predepositCampaignService.increaseAccountedAmounts(isPrivate, blockNumber, blockDate)
        }

        // Decrease accounted total and balances by reading an Onchain snapshot of the merged balances of all users.
        // Performed in deposit and retention state
        await predepositCampaignService.decreaseAccountedAmounts(isPrivate, blockDate)
      },
      {
        timeout: 10_000_000,
      }
    )
  } catch (e: any) {
    await telegramNotifierService.sendError(`Error on predepositScript : \`\`\`${e.toString()}\`\`\``)
  }
}

main().then()

function setUpPredepositCampaignScript() {
  const { providers } = setUpIndexer()

  const prismaClient = new PrismaClient()
  const predepositCampaignRepository = new PredepositCampaignRepository(prismaClient)
  const blockRepository = new BlockRepository(prismaClient)
  return {
    prismaClient,
    predepositCampaignService: new PredepositCampaignService(predepositCampaignRepository, blockRepository, providers[0]),
    telegramNotifierService: new TelegramNotifierService({
      botToken: process.env.TELEGRAM_BOT_TOKEN!,
      chatId: process.env.TELEGRAM_CHAT_ID!,
    }),
    setTransaction: (dbTransaction: TransactionPrisma): void => {
      predepositCampaignRepository.setClient(dbTransaction)
      blockRepository.setClient(dbTransaction)
    },
    providers,
  }
}
