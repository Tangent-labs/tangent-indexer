import { JsonRpcProvider, Contract } from "ethers"
import { PrismaClient } from "@prisma/client"
import * as dotenv from "dotenv"

dotenv.config()

const ERC20_ABI = ["function name() view returns (string)", "function symbol() view returns (string)", "function decimals() view returns (uint8)"]

const addresses = [
  "0x4dece678ceceb27446b35c672dc7d61f30bad69e",
  "0x95f00391cb5eebcd190eb58728b4ce23dbfa6ac1",
  "0x44d8fab7cd8b7877d5f79974c2f501af6e65abba",
  "0xd4467fbcbd3511112d2fd1af667e745d4987c8eb",
  "0x390f3595bca2df7d23783dfd126427cceb997bf4",
  "0x4e6bb6b7447b7b2aa268c16ab87f4bb48bf57939",
  "0xd1ddb0a0815fd28932fbb194c84003683af8a824",
  "0xf980f195a93577dcce48e91e98124d3b71c4a066",
  "0xb8af12adc58ed065919d64d14d8246b8d215ffe8",
  "0x9ea2d2a7cff38eaa4d92b2e766298170edfb79cb",
  "0xc4c3c6a5c6c60c90967fe3ed151dc51f1146c337",
  "0xc01f4f3f2fc83ab839e2d77d79e22a7c8570a609",
]

async function checkToken(address: string, provider: JsonRpcProvider) {
  const contract = new Contract(address, ERC20_ABI, provider)
  const result: { address: string; name: string | null; symbol: string | null; decimals: number | null } = {
    address,
    name: null,
    symbol: null,
    decimals: null,
  }

  try {
    result.name = await contract.name()
  } catch {}

  try {
    result.symbol = await contract.symbol()
  } catch {}

  try {
    result.decimals = Number(await contract.decimals())
  } catch {}

  return result
}

async function main() {
  const rpc = process.env.CHAIN_RPCS?.split(",")[0]
  if (!rpc) {
    console.error("CHAIN_RPCS env variable is not set")
    process.exit(1)
  }

  const provider = new JsonRpcProvider(rpc)
  const prisma = new PrismaClient()

  const [results, trackedTokens] = await Promise.all([
    Promise.all(addresses.map((addr) => checkToken(addr, provider))),
    prisma.tracked_erc20.findMany({ select: { address: true } }),
  ])

  const trackedSet = new Set(trackedTokens.map((t) => t.address.toLowerCase()))

  console.table(
    results.map((r) => ({
      address: r.address,
      symbol: r.symbol ?? "-",
      decimals: r.decimals ?? "-",
      erc20: r.symbol !== null && r.decimals !== null ? "yes" : "no",
      tracked: trackedSet.has(r.address.toLowerCase()) ? "yes" : "no",
    }))
  )

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
