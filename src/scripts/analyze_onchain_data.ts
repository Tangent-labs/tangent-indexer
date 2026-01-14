import { formatUnits } from "ethers"
import { PrismaClient } from "@prisma/client"
import * as dotenv from "dotenv"

dotenv.config()

interface OnchainData {
  data: {
    markets: string
    accounts: string
  }
  context: {
    isDbAlive: boolean
    providers: object[]
    walletsPks: string[]
    currentBlock: number
    executionKey: string
    currentRpcIndex: number
    currentWalletIndex: number
  }
}

interface MarketData {
  market: string
  collatToken: string
  maxLTV: number
  liquidationThreshold: number
  collateralUSDPrice: bigint
  oracleDecimals: number
}

interface AccountData {
  market: string
  healthRatio: bigint
  userDebt: bigint
  positionValue: bigint
  collateralBalance: bigint
}

function parseCSV<T>(csv: string): T[] {
  const lines = csv.trim().split("\n")
  const headers = lines[0].split(",")
  const data: T[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",")
    const row: Record<string, string | number | bigint> = {}

    headers.forEach((header, index) => {
      const value = values[index]
      // Detect if it's a large number (likely bigint)
      if (/^\d{10,}$/.test(value)) {
        row[header] = BigInt(value)
      } else if (/^\d+$/.test(value)) {
        row[header] = parseInt(value, 10)
      } else {
        row[header] = value
      }
    })

    data.push(row as T)
  }

  return data
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatBigNumber(value: bigint, decimals: number = 18): string {
  const formatted = formatUnits(value, decimals)
  const num = parseFloat(formatted)
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(2)}K`
  } else if (num >= 1) {
    return num.toFixed(4)
  } else {
    return num.toFixed(6)
  }
}

function formatPercentage(bps: number): string {
  return `${(bps / 1000).toFixed(1)}%`
}

function formatLTV(value: bigint): string {
  // LTV is in basis points (e.g., 90000 = 90%)
  const percent = Number(value) / 1000
  return `${percent.toFixed(2)}%`
}

const DENOMINATOR = 100000n // From the codebase

function analyzeOnchainData(jsonData: OnchainData): void {
  console.log("\n" + "=".repeat(120))
  console.log("                              ANALYSE DES DONNÉES ONCHAIN")
  console.log("=".repeat(120))

  // Parse data
  const markets = parseCSV<MarketData>(jsonData.data.markets)
  const accounts = parseCSV<AccountData>(jsonData.data.accounts)

  // Context info
  console.log("\n📋 CONTEXTE")
  console.log("-".repeat(60))
  console.log(`  Execution Key: ${jsonData.context.executionKey}`)
  console.log(`  DB Alive: ${jsonData.context.isDbAlive ? "✅ Oui" : "❌ Non"}`)
  console.log(`  Providers: ${jsonData.context.providers.length}`)
  console.log(`  Wallets: ${jsonData.context.walletsPks.length}`)
  console.log(`  Current Block: ${jsonData.context.currentBlock}`)

  // Markets table
  console.log("\n\n📊 MARCHÉS (" + markets.length + " marchés)")
  console.log("-".repeat(120))
  console.log(
    "| " +
      "Market".padEnd(14) +
      " | " +
      "Collat Token".padEnd(14) +
      " | " +
      "Max LTV".padEnd(8) +
      " | " +
      "Liq. Threshold".padEnd(14) +
      " | " +
      "Collat USD Price".padEnd(18) +
      " |"
  )
  console.log("|" + "-".repeat(16) + "|" + "-".repeat(16) + "|" + "-".repeat(10) + "|" + "-".repeat(16) + "|" + "-".repeat(20) + "|")

  for (const market of markets) {
    const price = formatBigNumber(market.collateralUSDPrice, market.oracleDecimals)
    console.log(
      "| " +
        formatAddress(market.market).padEnd(14) +
        " | " +
        formatAddress(market.collatToken).padEnd(14) +
        " | " +
        formatPercentage(market.maxLTV).padEnd(8) +
        " | " +
        formatPercentage(market.liquidationThreshold).padEnd(14) +
        " | " +
        `$${price}`.padEnd(18) +
        " |"
    )
  }

  // Accounts table (deduplicated by market since there are duplicates)
  const uniqueAccounts = new Map<string, AccountData>()
  for (const account of accounts) {
    const key = `${account.market}-${account.healthRatio}`
    if (!uniqueAccounts.has(key)) {
      uniqueAccounts.set(key, account)
    }
  }

  // Create a map of market -> liquidationThreshold from markets data
  const marketThresholds = new Map<string, number>()
  for (const market of markets) {
    marketThresholds.set(market.market, market.liquidationThreshold)
  }

  console.log("\n\n👤 COMPTES / POSITIONS (" + uniqueAccounts.size + " positions uniques)")
  console.log("-".repeat(160))
  console.log(
    "| " +
      "Market".padEnd(14) +
      " | " +
      "LTV".padEnd(10) +
      " | " +
      "Liq Thresh".padEnd(10) +
      " | " +
      "Status".padEnd(14) +
      " | " +
      "User Debt".padEnd(16) +
      " | " +
      "Position Value".padEnd(16) +
      " | " +
      "Collateral Bal".padEnd(16) +
      " |"
  )
  console.log(
    "|" +
      "-".repeat(16) +
      "|" +
      "-".repeat(12) +
      "|" +
      "-".repeat(12) +
      "|" +
      "-".repeat(16) +
      "|" +
      "-".repeat(18) +
      "|" +
      "-".repeat(18) +
      "|" +
      "-".repeat(18) +
      "|"
  )

  for (const [, account] of uniqueAccounts) {
    // Calculate LTV: (userDebt * DENOMINATOR) / positionValue
    const ltv = account.positionValue === 0n ? 0n : (account.userDebt * DENOMINATOR) / account.positionValue
    const liquidationThreshold = BigInt(marketThresholds.get(account.market) || 0)

    // Status logic from LiquidationService.ts:
    // - Seizable: userDebt >= positionValue (bad debt)
    // - Liquidable: ltv > liquidationThreshold
    let status = "🟢 Safe"
    if (account.userDebt >= account.positionValue) {
      status = "🔴 Seizable"
    } else if (ltv > liquidationThreshold) {
      status = "🟠 Liquidable"
    }

    console.log(
      "| " +
        formatAddress(account.market).padEnd(14) +
        " | " +
        formatLTV(ltv).padEnd(10) +
        " | " +
        formatLTV(liquidationThreshold).padEnd(10) +
        " | " +
        status.padEnd(14) +
        " | " +
        formatBigNumber(account.userDebt).padEnd(16) +
        " | " +
        formatBigNumber(account.positionValue).padEnd(16) +
        " | " +
        formatBigNumber(account.collateralBalance).padEnd(16) +
        " |"
    )
  }

  // Summary statistics
  console.log("\n\n📈 STATISTIQUES RÉSUMÉES")
  console.log("-".repeat(60))

  const totalDebt = Array.from(uniqueAccounts.values()).reduce((sum, a) => sum + a.userDebt, 0n)
  const totalPositionValue = Array.from(uniqueAccounts.values()).reduce((sum, a) => sum + a.positionValue, 0n)

  // Calculate status counts using correct logic
  let seizableCount = 0
  let liquidableCount = 0
  let safeCount = 0

  const ltvValues: number[] = []

  for (const [, account] of uniqueAccounts) {
    const ltv = account.positionValue === 0n ? 0n : (account.userDebt * DENOMINATOR) / account.positionValue
    const liquidationThreshold = BigInt(marketThresholds.get(account.market) || 0)
    ltvValues.push(Number(ltv) / 1000) // Convert to percentage

    if (account.userDebt >= account.positionValue) {
      seizableCount++
    } else if (ltv > liquidationThreshold) {
      liquidableCount++
    } else {
      safeCount++
    }
  }

  const minLTV = Math.min(...ltvValues)
  const maxLTV = Math.max(...ltvValues)
  const avgLTV = ltvValues.reduce((a, b) => a + b, 0) / ltvValues.length

  console.log(`  Total Positions: ${uniqueAccounts.size}`)
  console.log(`  Total Debt: ${formatBigNumber(totalDebt)}`)
  console.log(`  Total Position Value: ${formatBigNumber(totalPositionValue)}`)
  console.log(`  LTV - Min: ${minLTV.toFixed(2)}% | Max: ${maxLTV.toFixed(2)}% | Avg: ${avgLTV.toFixed(2)}%`)
  console.log(`  Status Distribution: 🔴 Seizable: ${seizableCount} | 🟠 Liquidable: ${liquidableCount} | 🟢 Safe: ${safeCount}`)

  // Collateral prices summary
  console.log("\n\n💰 PRIX DES COLLATÉRAUX (par token unique)")
  console.log("-".repeat(60))

  const tokenPrices = new Map<string, { price: bigint; decimals: number }>()
  for (const market of markets) {
    if (!tokenPrices.has(market.collatToken)) {
      tokenPrices.set(market.collatToken, {
        price: market.collateralUSDPrice,
        decimals: market.oracleDecimals,
      })
    }
  }

  for (const [token, data] of tokenPrices) {
    const price = formatBigNumber(data.price, data.decimals)
    console.log(`  ${formatAddress(token)}: $${price}`)
  }

  console.log("\n" + "=".repeat(120) + "\n")
}

/**
 * Load onchain data from database by liquidation_bot_log ID
 */
async function loadOnchainDataFromDb(logId: number): Promise<OnchainData | null> {
  const prisma = new PrismaClient()

  try {
    const log = await prisma.liquidation_bot_log.findUnique({
      where: { id: BigInt(logId) },
    })

    if (!log) {
      console.error(`No log found with ID ${logId}`)
      return null
    }

    if (log.action !== "on_chain_data") {
      console.error(`Log ${logId} is not an on_chain_data log (action: ${log.action})`)
      console.log(`Looking for on_chain_data log with same execution_key...`)

      // Try to find on_chain_data log with same execution_key
      const onchainLog = await prisma.liquidation_bot_log.findFirst({
        where: {
          execution_key: log.execution_key,
          action: "on_chain_data",
        },
      })

      if (!onchainLog) {
        console.error(`No on_chain_data log found for execution_key ${log.execution_key}`)
        return null
      }

      console.log(`Found on_chain_data log with ID ${onchainLog.id}`)
      return onchainLog.data as unknown as OnchainData
    }

    return log.data as unknown as OnchainData
  } finally {
    await prisma.$disconnect()
  }
}

/**
 * Main entry point
 */
async function main() {
  const logId = parseInt(process.argv[2], 10)

  if (isNaN(logId)) {
    console.error("Usage: npx tsx src/scripts/analyze_onchain_data.ts <log_id>")
    console.error("Example: npx tsx src/scripts/analyze_onchain_data.ts 29280")
    process.exit(1)
  }

  console.log(`Loading onchain data from liquidation_bot_log ID: ${logId}...`)

  const data = await loadOnchainDataFromDb(logId)

  if (!data) {
    process.exit(1)
  }

  analyzeOnchainData(data)
}

// Run if executed directly
main().catch((error) => {
  console.error("Error:", error)
  process.exit(1)
})

// Export for use as module
export { analyzeOnchainData, loadOnchainDataFromDb, OnchainData }
