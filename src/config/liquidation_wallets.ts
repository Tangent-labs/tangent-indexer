import "dotenv/config"

export function getLiquidatorWalletPks(): string[] {
  const walletPks =
    process.env.WALLET_PKS?.split(",")
      .map((pk) => pk.trim())
      .filter((pk) => pk.length > 0) ?? []

  // Single source: `process.env.WALLET_PKS` (trimmed, comma‑separated). No alternate env or default keys; must be non‑empty.
  if (walletPks.length === 0) {
    throw new Error("WALLET_PKS_NOT_SET")
  }

  return walletPks
}
