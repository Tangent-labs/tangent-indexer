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
  console.log(onchainData)
  // Verify profits of pegkeepers and trigger the rebalancing if needed
  await onchainTxBotService.updatePegKeepers(onchainData.profits, keeperAddresses, keeperNames)
  // Computes a relative variation computation between the current and next IR and Reward cut.
  // If the variation is greater than a threshold, we update them.
  await onchainTxBotService.updateIRAndRC(onchainData.irsAndRcs, addresses.markets, addresses.utilities.irCalculator, addresses.utilities.rewardAccumulator)
}

async function setup() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!botToken || !chatId) {
    throw new Error("TG_ENV_NOT_SET")
  }
  const telegramNotifierService = new TelegramNotifierService({
    botToken,
    chatId,
  })

  const pk = process.env.PKS_PEGKEEPER
  if (!pk) {
    throw new Error("PK_FOR_PEG_KEEPER_NOT_SET")
  }
  const chainRpcs = process.env.CHAIN_RPCS
  if (!chainRpcs) {
    throw new Error("CHAIN_RPCS_NOT_SET")
  }
  const rpc = chainRpcs.split(",")[0]
  const provider = new JsonRpcProvider(rpc)
  const signer = new Wallet(pk, provider)
  const addresses = await getAddressesJson()

  const onchainTxBotService = new OnchainTxBotService(telegramNotifierService, provider, signer)
  return { telegramNotifierService, signer, addresses, provider, onchainTxBotService }
}

main()
