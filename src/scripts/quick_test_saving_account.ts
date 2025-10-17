import * as dotenv from "dotenv"

import { setUpIndexer } from "../config/indexer_setup.js"
import { getSavingAccountLogs } from "../eventFectcher/savingAccountEventFetcher.js"
import { SavingAccountServices } from "services/events/SavingAccountServices.js"
import { SavingAccountRepository } from "db/SavingAccountRepository.js"
import { PrismaClient } from "@prisma/client"
import { BlockService } from "services/BlockService.js"
import { BlockRepository } from "db/BlockRepository.js"

dotenv.config()

// Adresse du vault à tester
const VAULT_ADDRESS = "0xBe53A109B494E5c9f97b9Cd39Fe969BE68BF6204"

async function quickTest() {
  console.log("🚀 Test rapide de récupération d'événements SavingAccount")
  console.log(`📍 Vault: ${VAULT_ADDRESS}`)

  const { providers } = setUpIndexer()
  const provider = providers[0]
  console.log(process.env.STARTING_BLOCK, await provider.getBlockNumber())
  const prismaClient = new PrismaClient()
  const savingAccountService = new SavingAccountServices(new SavingAccountRepository(prismaClient))
  const blockService = new BlockService(new BlockRepository(prismaClient))

  // Récupérer le numéro de bloc actuel
  const currentBlock = Number(process.env.STARTING_BLOCK) - 1
  console.log(`📊 Bloc actuel: ${currentBlock}`)

  // Tester différentes plages de blocs
  const testRanges = [
    //   { name: "Derniers 100 blocs", start: currentBlock - 100, end: currentBlock },
    //   { name: "Derniers 1000 blocs", start: currentBlock - 1000, end: currentBlock },
    { name: "Derniers 10000 blocs", start: currentBlock - 30000, end: currentBlock },
  ]

  for (const range of testRanges) {
    console.log(`\n🔍 Test: ${range.name} (${range.start} -> ${range.end})`)

    const events = await getSavingAccountLogs(provider, range.start, range.end, [VAULT_ADDRESS])
    console.log(`✅ ${events.length} événement(s) trouvé(s)`)
    const blockInfos = (await blockService.fetchBlockTimestamps(
      events.map((event) => event.block_id),
      "http://127.0.0.1:8545/"
    )) as Map<number, number>

    await savingAccountService.saveSavingAccountEvents(events, blockInfos)
    console.log("✅ Événements sauvegardés avec succès")

    if (events.length > 0) {
      console.log("📋 Détails du premier événement:")
      const firstEvent = events[0]
      console.log(`  - Block: ${firstEvent.block_id}`)
      console.log(`  - TX: ${firstEvent.tx_hash}`)
      console.log(`  - Token: ${firstEvent.token}`)
      console.log(`  - Gain: ${firstEvent.gain.toString()}`)
      console.log(`  - Loss: ${firstEvent.loss.toString()}`)
      break // Arrêter dès qu'on trouve des événements
    }
  }

  console.log("\n🎉 Test rapide terminé!")
}

// Exécuter le script si appelé directement
if (process.env.NODE_ENV !== "test") {
  quickTest()
    .then(() => {
      console.log("✅ Script rapide terminé")
      process.exit(0)
    })
    .catch((error) => {
      console.error("❌ Erreur fatale:", error)
      process.exit(1)
    })
}

export { quickTest }
