import { JsonRpcProvider, Wallet } from "ethers"
import * as dotenv from "dotenv"
import { getAddressesJson } from "../utils/jsonReader.js"
import { TelegramNotifierService } from "../services/TelegramNotificationServices.js"
import { OnchainTxBotService } from "../services/OnchainTxBotService.js"

dotenv.config()

async function main() {
  const { addresses, onchainTxBotService } = await setup()

  // Prepare parameters
  const marketAddresses = addresses.markets.map((m) => m.marketAddress)
  const keeperAddresses = Object.values(addresses.pegKeepers).map((k) => k)
  const keeperNames = Object.keys(addresses.pegKeepers).map((k) => k)

  // Retrieve the onchain data of :
  //  - Profits of the pegKeepers
  //  - Current and Next,  Interest Rate and Reward cut for all the markets
  const onchainData = await onchainTxBotService.getOnChainData(marketAddresses, keeperAddresses)
  // Verify profits of pegkeepers and trigger the rebalancing if needed
  await onchainTxBotService.updatePegKeepers(onchainData.profits, keeperAddresses, keeperNames)
  // Computes a relative variation computation between the current and next IR and Reward cut.
  // If the variation is greater than a threshold, we update them.
  await onchainTxBotService.updateIRAndRC(onchainData.irsAndRcs, addresses.markets, addresses.utilities.irCalculator, addresses.utilities.rewardAccumulator)
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
    throw Error(`Following env variables are not set : ${setupErrors.join(",")}`)
  }

  const telegramNotifierService = new TelegramNotifierService({
    botToken,
    chatId,
  })
  const rpc = chainRpcs.split(",")[0]
  const provider = new JsonRpcProvider(rpc)
  const signer = new Wallet(pk, provider)
  const addresses = await getAddressesJson()

  const onchainTxBotService = new OnchainTxBotService(telegramNotifierService, provider, signer)
  return { telegramNotifierService, signer, addresses, provider, onchainTxBotService }
}

main()
