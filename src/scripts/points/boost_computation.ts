import { PrismaClient } from "@prisma/client"

import { BoostService } from "../../services/boost/BoostService.js"
import { _initNetwork } from "../../config/indexer_setup.js"
import { BoostRepository } from "../../db/Points/BoostRepository.js"

const prisma = new PrismaClient()

const rpcs = _initNetwork()
const boostRepository = new BoostRepository(prisma)
const boostService = new BoostService(rpcs.providers[0], boostRepository)

async function updateBoosts() {
  await boostService.updateBoosts()
}

updateBoosts()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect())
