import { formatUnits } from "ethers"
import { PrismaClient } from "@prisma/client"
import * as dotenv from "dotenv"
import * as fs from "fs"
import * as path from "path"

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

function parseCSV<T>(
  csv: string,
  opts?: {
    /**
     * Force these columns to be parsed as bigint, even when the value is small
     * (e.g. "0"). This prevents mixing number/bigint later in calculations.
     */
    bigintHeaders?: ReadonlySet<string>
  }
): T[] {
  const lines = csv.trim().split("\n")
  const headers = lines[0].split(",")
  const data: T[] = []
  const bigintHeaders = opts?.bigintHeaders ?? new Set<string>()

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",")
    const row: Record<string, string | number | bigint> = {}

    headers.forEach((header, index) => {
      const headerKey = header.trim()
      const value = (values[index] ?? "").trim()

      if (bigintHeaders.has(headerKey)) {
        // Always parse as bigint (including "0")
        row[headerKey] = BigInt(value || "0")
      } else if (/^\d{10,}$/.test(value)) {
        // Detect if it's a large number (likely bigint)
        row[headerKey] = BigInt(value)
      } else if (/^\d+$/.test(value)) {
        row[headerKey] = parseInt(value, 10)
      } else {
        row[headerKey] = value
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

/**
 * Load market address to marketName mapping from addresses.json
 */
function loadMarketNameMap(): Map<string, string> {
  const addressesPath = path.join(process.cwd(), "addresses.json")
  const addressesData = JSON.parse(fs.readFileSync(addressesPath, "utf-8"))
  const marketMap = new Map<string, string>()

  if (addressesData.markets && Array.isArray(addressesData.markets)) {
    for (const market of addressesData.markets) {
      if (market.marketAddress && market.marketName) {
        // Use lowercase for case-insensitive matching
        marketMap.set(market.marketAddress.toLowerCase(), market.marketName)
      }
    }
  }

  return marketMap
}

type MarketSummary = {
  market: string
  collatName: string
  borrowers: number
  totalDebt: bigint
  totalPositionValue: bigint
  safe: number
  liquidable: number
  seizable: number
  liquidationThreshold: bigint
}

function buildMarketSummaries(jsonData: OnchainData, marketCollatNameMap: Map<string, string>): Map<string, MarketSummary> {
  const markets = parseCSV<MarketData>(jsonData.data.markets, { bigintHeaders: new Set(["collateralUSDPrice"]) })
  const accounts = parseCSV<AccountData>(jsonData.data.accounts, {
    bigintHeaders: new Set(["healthRatio", "userDebt", "positionValue", "collateralBalance"]),
  })

  const marketThresholds = new Map<string, number>()
  for (const market of markets) marketThresholds.set(market.market, market.liquidationThreshold)

  const summaryMap = new Map<string, MarketSummary>()

  for (const account of accounts) {
    const liquidationThreshold = BigInt(marketThresholds.get(account.market) || 0)
    const ltv = account.positionValue === 0n ? 0n : (account.userDebt * DENOMINATOR) / account.positionValue
    const collatName = marketCollatNameMap.get(account.market.toLowerCase()) || "N/A"

    if (!summaryMap.has(account.market)) {
      summaryMap.set(account.market, {
        market: account.market,
        collatName,
        borrowers: 0,
        totalDebt: 0n,
        totalPositionValue: 0n,
        safe: 0,
        liquidable: 0,
        seizable: 0,
        liquidationThreshold,
      })
    }

    const s = summaryMap.get(account.market)!
    s.borrowers++
    s.totalDebt += account.userDebt
    s.totalPositionValue += account.positionValue

    if (account.userDebt >= account.positionValue) s.seizable++
    else if (ltv > liquidationThreshold) s.liquidable++
    else s.safe++
  }

  return summaryMap
}

function delta(before: number, after: number): string {
  const d = after - before
  return d === 0 ? "—" : d > 0 ? `+${d}` : `${d}`
}

function compareOnchainData(before: OnchainData, after: OnchainData): void {
  const marketCollatNameMap = loadMarketCollatNameMap()
  const beforeMap = buildMarketSummaries(before, marketCollatNameMap)
  const afterMap = buildMarketSummaries(after, marketCollatNameMap)

  const allMarkets = new Set([...beforeMap.keys(), ...afterMap.keys()])

  console.log("\n" + "=".repeat(140))
  console.log("                              COMPARAISON DES SNAPSHOTS")
  console.log(`  AVANT  block ${before.context.currentBlock}  (exec: ${before.context.executionKey})`)
  console.log(`  APRÈS  block ${after.context.currentBlock}  (exec: ${after.context.executionKey})`)
  console.log("=".repeat(140))

  const tableData = Array.from(allMarkets).map((market) => {
    const b = beforeMap.get(market)
    const a = afterMap.get(market)
    const collatName = b?.collatName ?? a?.collatName ?? "N/A"

    let event = ""
    if (!b) event = "NEW"
    else if (!a) event = b.seizable > 0 ? "SEIZED+CLOSED" : "CLOSED"
    else {
      const events: string[] = []

      if (b.seizable > 0 && a.seizable < b.seizable) events.push(`${b.seizable - a.seizable} saisi(s)`)
      if (b.liquidable > 0 && a.liquidable < b.liquidable) events.push(`${b.liquidable - a.liquidable} liquidé(s)`)
      if (b.borrowers > a.borrowers) events.push(`${b.borrowers - a.borrowers} sorti(s)`)
      if (b.borrowers < a.borrowers) events.push(`+${a.borrowers - b.borrowers} entré(s)`)
      event = events.join(", ")
    }

    return {
      Market: formatAddress(market),
      Collat: collatName,
      "#Av": b?.borrowers ?? 0,
      "#Ap": a?.borrowers ?? 0,
      "🔴 Av": b?.seizable ?? 0,
      "🔴 Ap": a?.seizable ?? 0,
      "Δ🔴": delta(b?.seizable ?? 0, a?.seizable ?? 0),
      "🟠 Av": b?.liquidable ?? 0,
      "🟠 Ap": a?.liquidable ?? 0,
      "Δ🟠": delta(b?.liquidable ?? 0, a?.liquidable ?? 0),
      "🟢 Av": b?.safe ?? 0,
      "🟢 Ap": a?.safe ?? 0,
      Événements: event,
    }
  })

  console.table(tableData)

  // Global summary
  const totalBefore = { borrowers: 0, seizable: 0, liquidable: 0, safe: 0, debt: 0n }
  const totalAfter = { borrowers: 0, seizable: 0, liquidable: 0, safe: 0, debt: 0n }
  for (const s of beforeMap.values()) {
    totalBefore.borrowers += s.borrowers
    totalBefore.seizable += s.seizable
    totalBefore.liquidable += s.liquidable
    totalBefore.safe += s.safe
    totalBefore.debt += s.totalDebt
  }
  for (const s of afterMap.values()) {
    totalAfter.borrowers += s.borrowers
    totalAfter.seizable += s.seizable
    totalAfter.liquidable += s.liquidable
    totalAfter.safe += s.safe
    totalAfter.debt += s.totalDebt
  }

  console.log("\n📈 BILAN GLOBAL")
  console.log("-".repeat(80))
  console.log(`  Positions   : ${totalBefore.borrowers} → ${totalAfter.borrowers}  (${delta(totalBefore.borrowers, totalAfter.borrowers)})`)
  console.log(`  Total Debt  : ${formatBigNumber(totalBefore.debt)} → ${formatBigNumber(totalAfter.debt)}`)
  console.log(`  🔴 Seizable : ${totalBefore.seizable} → ${totalAfter.seizable}  (${delta(totalBefore.seizable, totalAfter.seizable)})`)
  console.log(`  🟠 Liquidable: ${totalBefore.liquidable} → ${totalAfter.liquidable}  (${delta(totalBefore.liquidable, totalAfter.liquidable)})`)
  console.log(`  🟢 Safe     : ${totalBefore.safe} → ${totalAfter.safe}  (${delta(totalBefore.safe, totalAfter.safe)})`)
  console.log("=".repeat(140) + "\n")
}

function analyzeOnchainData(jsonData: OnchainData): void {
  console.log("\n" + "=".repeat(120))
  console.log("                              ANALYSE DES DONNÉES ONCHAIN")
  console.log("=".repeat(120))

  // Parse data
  const markets = parseCSV<MarketData>(jsonData.data.markets, {
    bigintHeaders: new Set(["collateralUSDPrice"]),
  })
  const accounts = parseCSV<AccountData>(jsonData.data.accounts, {
    bigintHeaders: new Set(["healthRatio", "userDebt", "positionValue", "collateralBalance"]),
  })

  // Load market to marketName mapping
  const marketNameMap = loadMarketNameMap()

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
  console.log("-".repeat(150))
  console.log(
    "| " +
      "Market".padEnd(14) +
      " | " +
      "Collat Name".padEnd(20) +
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
  console.log("|" + "-".repeat(16) + "|" + "-".repeat(22) + "|" + "-".repeat(16) + "|" + "-".repeat(10) + "|" + "-".repeat(16) + "|" + "-".repeat(20) + "|")

  for (const market of markets) {
    const price = formatBigNumber(market.collateralUSDPrice, market.oracleDecimals)
    const marketName = marketNameMap.get(market.market.toLowerCase()) || "N/A"
    console.log(
      "| " +
        formatAddress(market.market).padEnd(14) +
        " | " +
        marketName.padEnd(20) +
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

  // Create a map of market -> liquidationThreshold from markets data
  const marketThresholds = new Map<string, number>()
  for (const market of markets) {
    marketThresholds.set(market.market, market.liquidationThreshold)
  }

  const marketSummaryMap = buildMarketSummaries(jsonData, marketCollatNameMap)

  console.log("\n\n📊 SYNTHÈSE PAR MARCHÉ (" + accounts.length + " positions / " + markets.length + " marchés)")
  console.log("-".repeat(120))

  // Build table data for console.table
  const tableData = accounts.map((account) => {
    const ltv = account.positionValue === 0n ? 0n : (account.userDebt * DENOMINATOR) / account.positionValue
    const liquidationThreshold = BigInt(marketThresholds.get(account.market) || 0)
    const marketName = marketNameMap.get(account.market.toLowerCase()) || "N/A"

    let status = "🟢 Safe"
    if (account.userDebt >= account.positionValue) {
      status = "🔴 Seizable"
    } else if (ltv > liquidationThreshold) {
      status = "🟠 Liquidable"
    }

    return {
      Market: formatAddress(account.market),
      "Collat Name": marketName,
      LTV: formatLTV(ltv),
      "Liq Thresh": formatLTV(liquidationThreshold),
      Status: status,
      "User Debt": formatBigNumber(account.userDebt),
      "Position Value": formatBigNumber(account.positionValue),
      "Collateral Bal": formatBigNumber(account.collateralBalance),
    }
  })

  console.table(tableData)

  // Summary statistics
  console.log("\n\n📈 STATISTIQUES RÉSUMÉES")
  console.log("-".repeat(60))

  const totalDebt = accounts.reduce((sum, a) => sum + a.userDebt, 0n)
  const totalPositionValue = accounts.reduce((sum, a) => sum + a.positionValue, 0n)

  // Calculate status counts using correct logic
  let seizableCount = 0
  let liquidableCount = 0
  let safeCount = 0

  const ltvValues: number[] = []

  for (const account of accounts) {
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

  console.log(`  Total Positions: ${accounts.length}`)
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
    console.log(log)

    if (!log) {
      console.error(`No log found with ID ${logId}`)
      return null
    }

    if (log.action !== "on_chain_data") {
      console.error(`Log ${logId} =>  action!=="on_chain_data"  ( current action: ${log.action})`)
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
 * Load the most recent on_chain_data entry from the database
 */
async function loadLatestOnchainDataFromDb(): Promise<OnchainData | null> {
  const prisma = new PrismaClient()

  try {
    const log = await prisma.liquidation_bot_log.findFirst({
      where: { action: "on_chain_data" },
      orderBy: { id: "desc" },
    })

    if (!log) {
      console.error("No on_chain_data log found in database")
      return null
    }

    console.log(`Found latest on_chain_data log with ID ${log.id} (date: ${log.date})`)
    return log.data as unknown as OnchainData
  } finally {
    await prisma.$disconnect()
  }
}

/**
 * Load the two most recent on_chain_data entries from the database
 */
async function loadLatestTwoOnchainDataFromDb(): Promise<[OnchainData, OnchainData] | null> {
  const prisma = new PrismaClient()

  try {
    const logs = await prisma.liquidation_bot_log.findMany({
      where: { action: "on_chain_data" },
      orderBy: { id: "desc" },
      take: 2,
    })

    if (logs.length < 2) {
      console.error(`Seulement ${logs.length} snapshot(s) trouvé(s), besoin de 2 pour comparer`)
      return null
    }

    console.log(`Snapshot AVANT : ID ${logs[1].id} (${logs[1].date})`)
    console.log(`Snapshot APRÈS : ID ${logs[0].id} (${logs[0].date})`)
    return [logs[1].data as unknown as OnchainData, logs[0].data as unknown as OnchainData]
  } finally {
    await prisma.$disconnect()
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--")
  const arg1 = args[0]
  const arg2 = args[1]

  // Auto-diff mode: --diff flag
  if (arg1 === "--diff") {
    console.log("Mode diff : chargement des 2 derniers snapshots...")
    const pair = await loadLatestTwoOnchainDataFromDb()
    if (!pair) process.exit(1)
    compareOnchainData(pair[0], pair[1])
    return
  }

  // Compare mode: two IDs provided
  if (arg1 && arg2) {
    const id1 = parseInt(arg1, 10)
    const id2 = parseInt(arg2, 10)
    if (isNaN(id1) || isNaN(id2)) {
      console.error("Usage: npm run dev:liquidation:analyse <id_avant> <id_après>")
      process.exit(1)
    }
    console.log(`Chargement du snapshot AVANT (ID: ${id1})...`)
    const before = await loadOnchainDataFromDb(id1)
    console.log(`Chargement du snapshot APRÈS (ID: ${id2})...`)
    const after = await loadOnchainDataFromDb(id2)
    if (!before || !after) process.exit(1)
    compareOnchainData(before, after)
    return
  }

  // Single snapshot mode
  let data: OnchainData | null

  if (!arg1) {
    console.log("No log_id provided, fetching latest on_chain_data from database...")
    data = await loadLatestOnchainDataFromDb()
  } else {
    const logId = parseInt(arg1, 10)
    if (isNaN(logId)) {
      console.error("Usage: npm run dev:liquidation:analyse [log_id]")
      console.error("       npm run dev:liquidation:analyse <id_avant> <id_après>  (comparaison)")
      process.exit(1)
    }
    console.log(`Loading onchain data from liquidation_bot_log ID: ${logId}...`)
    data = await loadOnchainDataFromDb(logId)
  }

  if (!data) process.exit(1)
  analyzeOnchainData(data!)
}

// Run if executed directly
main().catch((error) => {
  console.error("Error:", error)
  process.exit(1)
})

// Export for use as module
export { analyzeOnchainData, loadOnchainDataFromDb, loadLatestOnchainDataFromDb, OnchainData }
