import { PrismaClient } from "@prisma/client"
import { JsonRpcProvider, Wallet } from "ethers"
import * as dotenv from "dotenv"
import { getAddressesJson } from "../../utils/jsonReader.js"
import { TelegramNotifierService } from "../../services/TelegramNotificationServices.js"
import { OnchainTxBotService } from "../../services/OnchainTxBotService.js"
import { IndexerExecutionLogService } from "../../services/IndexerExecutionLogService.js"
import { INDEXER_EXECUTION_NAMES } from "../../type/indexerExecution.js"

dotenv.config()

const IR_RC_INTERVAL_MIN = Number(process.env.IR_RC_INTERVAL_MIN ?? 5)

async function main() {
  const { addresses, onchainTxBotService, indexerExecutionLogService } = await setup()

  await indexerExecutionLogService.run(INDEXER_EXECUTION_NAMES.ONCHAIN_TX_BOT, async () => {
    // Prepare parameters
    const marketAddresses = addresses.markets.map((m) => m.marketAddress)
    const keeperAddresses = Object.values(addresses.pegKeepers).map((k) => k)
    const keeperNames = Object.keys(addresses.pegKeepers).map((k) => k.replace("-", ""))

    // Retrieve the onchain data of :
    //  - Profits of the pegKeepers
    //  - Current and Next,  Interest Rate and Reward cut for all the markets
    const onchainData = await onchainTxBotService.getOnChainData(marketAddresses, keeperAddresses)

    // Verify profits of pegkeepers and trigger the rebalancing if needed
    await onchainTxBotService.updatePegKeepers(onchainData.profits, keeperAddresses, keeperNames)

    // IR/RC is not urgent: evaluate at most once every IR_RC_INTERVAL_MIN minutes.
    const lastIrRcRun = await indexerExecutionLogService.getLatestSuccessFinishedAt(INDEXER_EXECUTION_NAMES.IR_RC_UPDATE)
    if (lastIrRcRun && Date.now() - lastIrRcRun.getTime() < IR_RC_INTERVAL_MIN * 60_000) {
      return
    }

    // Checkpoints IR / Reward cut when the change passes the absolute + relative thresholds and gas is acceptable.
    await indexerExecutionLogService.run(INDEXER_EXECUTION_NAMES.IR_RC_UPDATE, () =>
      onchainTxBotService.updateIRAndRC(onchainData.irsAndRcs, addresses.markets, addresses.utilities.irCalculator, addresses.utilities.rewardAccumulator)
    )
  })
}

async function setup() {
  const setupErrors = []

  const botToken = process.env.TELEGRAM_BOT_TOKEN!
  if (!botToken) {
    setupErrors.push("TELEGRAM_BOT_TOKEN")
  }
  const chatId = process.env.TELEGRAM_CHAT_ID!
  if (!chatId) {
    setupErrors.push("TELEGRAM_CHAT_ID")
  }
  const pk = process.env.PK_UPDATE_TX_BOT!
  if (!pk) {
    setupErrors.push("PK_UPDATE_TX_BOT")
  }
  const chainRpcs = process.env.CHAIN_RPCS?.split(",")[0]!
  if (!chainRpcs) {
    setupErrors.push("CHAIN_RPCS_NOT_SET")
  }
  if (setupErrors.length !== 0) {
    throw new Error(`Following env variables are not set : ${setupErrors.join(",")}`)
  }

  const telegramNotifierService = new TelegramNotifierService({
    botToken,
    chatId,
  })
  const prismaClient = new PrismaClient()
  const rpc = chainRpcs.split(",")[0]
  const provider = new JsonRpcProvider(rpc)
  const signer = new Wallet(pk, provider)
  const addresses = await getAddressesJson()

  const indexerExecutionLogService = IndexerExecutionLogService.fromClient(prismaClient)
  const onchainTxBotService = new OnchainTxBotService(telegramNotifierService, provider, signer, indexerExecutionLogService)
  return { telegramNotifierService, signer, addresses, provider, onchainTxBotService, indexerExecutionLogService }
}

main()
  .then(() => {
    console.log("On chain tx bot script ran")
  })
  .catch((e) => {
    console.error(e.toString())
  })
