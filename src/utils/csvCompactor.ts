import { LiquidationMarketAccountOutInfo, LiquidationMarketOutInfo, LiquidationAccountOutInfo } from "../type/data.js"

/**
 * Escapes a CSV field value, handling quotes and commas
 */
function escapeCsvField(value: string | bigint | number | null | undefined): string {
  if (value === null || value === undefined) {
    return ""
  }
  const str = typeof value === "bigint" ? value.toString() : String(value)
  // If the field contains comma, quote, or newline, wrap it in quotes and escape internal quotes
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Converts LiquidationMarketAccountOutInfo to a compact CSV format
 * Returns an object with markets and accounts as CSV strings
 */
export function compactOnchainDataToCsv(data: LiquidationMarketAccountOutInfo | null): {
  marketsCsv: string
  accountsCsv: string
} {
  if (!data) {
    return { marketsCsv: "", accountsCsv: "" }
  }

  // Markets CSV: market, collatToken, maxLTV, liquidationThreshold, collateralUSDPrice, oracleDecimals
  const marketsHeader = "market,collatToken,maxLTV,liquidationThreshold,collateralUSDPrice,oracleDecimals"
  const marketsRows = data.markets.map((m: LiquidationMarketOutInfo) => {
    return [
      escapeCsvField(m.market?.toString()),
      escapeCsvField(m.collatToken?.toString()),
      escapeCsvField(m.maxLTV),
      escapeCsvField(m.liquidationThreshold?.toString()),
      escapeCsvField(m.collateralUSDPrice?.toString()),
      escapeCsvField(m.oracleDecimals?.toString()),
    ].join(",")
  })
  const marketsCsv = [marketsHeader, ...marketsRows].join("\n")

  // Accounts CSV: market, healthRatio, userDebt, positionValue, collateralBalance
  const accountsHeader = "market,healthRatio,userDebt,positionValue,collateralBalance"
  const accountsRows = data.accounts.map((a: LiquidationAccountOutInfo) => {
    return [
      escapeCsvField(a.market?.toString()),
      escapeCsvField(a.healthRatio?.toString()),
      escapeCsvField(a.userDebt?.toString()),
      escapeCsvField(a.positionValue?.toString()),
      escapeCsvField(a.collateralBalance?.toString()),
    ].join(",")
  })
  const accountsCsv = [accountsHeader, ...accountsRows].join("\n")

  return { marketsCsv, accountsCsv }
}
