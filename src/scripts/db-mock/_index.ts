import * as dotenv from "dotenv"
import { getAddressesJson } from "../../utils/jsonReader.js"
import { seedTotalSupply } from "../db-seed/seed_total_supply.js"

dotenv.config()

async function main() {
  const addresses = await getAddressesJson()
  // mock total supply data
  await seedTotalSupply(addresses)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
