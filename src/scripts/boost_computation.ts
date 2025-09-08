import { PrismaClient } from "@prisma/client"
import { BoostService } from "services/boost/BoostService"
import { _initNetwork } from "config/indexer_setup"
import { BoostRepository } from "db/BoostRepository"

const prisma = new PrismaClient()

const rpcs = _initNetwork()
const boostRepository = new BoostRepository(prisma)
const boostService = new BoostService(rpcs.providers[0], boostRepository)

async function seedTokens() {
  await boostService.updateBoosts()
}

seedTokens()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect())
