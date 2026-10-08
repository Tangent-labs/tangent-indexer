import { AbiCoder, Interface, JsonRpcProvider } from "ethers"

/**
 * @notice Walks the collateral oracle of every deployed market (fallbacks included) and lists every
 *         Curve LP the price goes through, with its TVL. LPs under SMALL_TVL_USD are flagged.
 *
 *         Run: npx tsx src/scripts/utils/audit_oracle_curve_lps.ts
 *         Env: ETH_RPC (default publicnode), SMALL_TVL_USD (default 1_000_000)
 */

// Source: tangent-contracts/addresses-prod.json
const MARKETS: [string, string][] = [
  ["PYUSD/USDC", "0x4742a56668fbacbc11087f516c4b01ebc48f716f"],
  ["RLUSD/USDC", "0xbffbd9c9ac1645285d017a69885304831e8b9b71"],
  ["frxUSD/sUSDS", "0xd2c7257efe28a1b1446904a371e3d51e1c2f7e0e"],
  ["BOLD/USDC", "0xc9c80e8481c2b6f979afc155bc3f979cfad19c56"],
  ["frxUSD/sDOLA", "0xd3d29a8752fc40d64a20bbc043147077570c1785"],
  ["USDT/crvUSD", "0xaed9bcae0831caf4a45739ec7910cedf2ac5d9a1"],
  ["frxUSD/scrvUSD", "0x5c996574270f439bfff5b7647ee92c1879d35a4b"],
  ["eUSD/USDC", "0xa6069a4a53b564eb0a312e08f5af19ae2ba5d67e"],
  ["reUSD/scrvUSD", "0x161d6fa48b0e0152763c3929a3813bd177fc099f"],
  ["frxUSD/OUSD", "0x56dbc69208044748af4d33392e25fc9336f11931"],
  ["msETH/WETH", "0x7b1b38cad63b0715a0adfeeb75e46431b48e73b6"],
  ["msETH/OETH", "0x2b2962931433fe137fd17cf62df4b9ec84a7de00"],
  ["cbBTC/WBTC", "0x4903f0d3698ddc5ca66040b235de0a2126a41437"],
  ["reUSD/sDOLA", "0x244c24c94d5bbdba43c408b702ded98e436df721"],
  ["USDC/fxUSD", "0x849cf82e0ebcfeab8270cc5a3ea3b26cd481b754"],
  ["fxUSD/reUSD", "0xa63ded87df22ee573567ad1dd87d0a71c8fcd380"],
]

const SMALL_TVL_USD = Number(process.env.SMALL_TVL_USD ?? 1_000_000)
const provider = new JsonRpcProvider(process.env.ETH_RPC ?? "https://ethereum-rpc.publicnode.com", 1, { staticNetwork: true })

const iface = new Interface([
  "function collatOracle() view returns (address)",
  "function oracleName() view returns (string)",
  "function oracleParams()",
  "function params()",
  "function oracle() view returns (address)",
  "function get_virtual_price() view returns (uint256)",
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
  "function description() view returns (string)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
])
const coder = AbiCoder.defaultAbiCoder()

type Kind = "oracle" | "curveLp" | "chainlink" | "other"
type Node = { address: string; kind: Kind; label: string; children: { role: string; node: Node }[] }

async function call(to: string, fn: string, args: unknown[] = []): Promise<string | null> {
  try {
    const res = await provider.call({ to, data: iface.encodeFunctionData(fn, args) })
    return res === "0x" ? null : res
  } catch {
    return null
  }
}

async function callString(to: string, fn: string): Promise<string | null> {
  const res = await call(to, fn)
  if (!res) return null
  try {
    return coder.decode(["string"], res)[0]
  } catch {
    return null
  }
}

/** Splits a raw struct return into 32-byte words and keeps the ones that look like addresses. */
function addressWords(raw: string): { index: number; address: string }[] {
  const words = raw.slice(2).match(/.{64}/g) ?? []
  return words
    .map((w, index) => ({ index, value: BigInt("0x" + w) }))
    .filter(({ value }) => value > 2n ** 100n && value < 2n ** 160n)
    .map(({ index, value }) => ({ index, address: "0x" + value.toString(16).padStart(40, "0") }))
}

const cache = new Map<string, Promise<Node>>()
function resolve(address: string): Promise<Node> {
  address = address.toLowerCase()
  if (!cache.has(address)) cache.set(address, resolveUncached(address))
  return cache.get(address)!
}

async function resolveUncached(address: string): Promise<Node> {
  const oracleName = await callString(address, "oracleName")
  if (oracleName !== null) {
    const node: Node = { address, kind: "oracle", label: oracleName, children: [] }
    const oracleParams = await call(address, "oracleParams")
    const raw = oracleParams ?? (await call(address, "params"))
    if (raw) {
      // OracleChainlinkWrapper.oracleParams = (feed, decimals, heartbeat, fallback)
      const isChainlinkWrapper = oracleParams !== null && raw.length === 2 + 64 * 4
      for (const { index, address: child } of addressWords(raw)) {
        const childNode = await resolve(child)
        // OracleCoinFromCurveLP (oracleParams) reads the pool EMA price_oracle(): a thin pool moves the price.
        // OracleDuoPoolStable / OracleCryptoSwap (params) read get_virtual_price()/lp_price() of the collateral LP itself.
        let role = isChainlinkWrapper && index === 3 ? "FALLBACK" : ""
        if (childNode.kind === "curveLp") role = oracleParams ? "EMA" : "VP"
        node.children.push({ role, node: childNode })
      }
    } else {
      // USGMorphoAdapter style
      const inner = await call(address, "oracle")
      if (inner) node.children.push({ role: "", node: await resolve(coder.decode(["address"], inner)[0]) })
    }
    return node
  }
  if (await call(address, "get_virtual_price")) {
    return { address, kind: "curveLp", label: (await callString(address, "name")) ?? "?", children: [] }
  }
  if (await call(address, "latestRoundData")) {
    return { address, kind: "chainlink", label: (await callString(address, "description")) ?? "?", children: [] }
  }
  return { address, kind: "other", label: (await callString(address, "symbol")) ?? "no oracleName (unknown contract)", children: [] }
}

async function fetchCurveTvls(): Promise<Map<string, number>> {
  const res = await fetch("https://api.curve.finance/v1/getPools/all/ethereum")
  const pools = (await res.json()).data.poolData as { address: string; lpTokenAddress?: string; usdTotal: number }[]
  const tvls = new Map<string, number>()
  for (const p of pools) {
    tvls.set(p.address.toLowerCase(), p.usdTotal)
    if (p.lpTokenAddress) tvls.set(p.lpTokenAddress.toLowerCase(), p.usdTotal)
  }
  return tvls
}

const usd = (v: number | undefined) => (v === undefined ? "n/a" : "$" + Math.round(v).toLocaleString("en-US"))

async function main() {
  const tvls = await fetchCurveTvls()
  // lp address -> { label, markets using it, oracles reading it, read as EMA price or virtual price }
  // Only pools read through price_oracle() (EMA) set a price. Collateral LPs read via get_virtual_price() are ignored.
  // lp address -> { label, markets using it, full oracle paths reaching it }
  const lpUsage = new Map<string, { label: string; markets: Set<string>; paths: Set<string> }>()

  function print(root: string, node: Node, role: string, prefix: string, path: string[], seen: Set<string>) {
    const tvl = node.kind === "curveLp" ? `  TVL ${usd(tvls.get(node.address))}` : ""
    const tag = role ? `[${role}] ` : ""
    console.log(`${prefix}${tag}${node.kind.padEnd(9)} ${node.address}  ${node.label}${tvl}`)
    if (node.kind === "curveLp" && role === "EMA") {
      const usage = lpUsage.get(node.address) ?? { label: node.label, markets: new Set(), paths: new Set() }
      usage.markets.add(root)
      usage.paths.add(path.join(" -> "))
      lpUsage.set(node.address, usage)
    }
    if (seen.has(node.address)) return
    for (const c of node.children) {
      const step = c.role === "FALLBACK" ? `[FALLBACK] ${c.node.label}` : c.node.label
      print(root, c.node, c.role, prefix + "    ", [...path, step], new Set([...seen, node.address]))
    }
  }

  console.log("=== Oracle tree per market ===")
  for (const [name, market] of MARKETS) {
    const raw = await call(market, "collatOracle")
    if (!raw) {
      console.log(`\n${name} (${market}): collatOracle() call failed`)
      continue
    }
    const oracle = coder.decode(["address"], raw)[0]
    console.log(`\n${name}  market ${market}`)
    const root = await resolve(oracle)
    print(name, root, "", "  ", [root.label], new Set())
  }

  console.log(`\n=== Curve LPs used as price source (price_oracle EMA), small = TVL < ${usd(SMALL_TVL_USD)} ===`)
  const rows = [...lpUsage.entries()].map(([address, u]) => ({ address, ...u, tvl: tvls.get(address) })).sort((a, b) => (a.tvl ?? -1) - (b.tvl ?? -1))
  for (const r of rows) {
    const flag = r.tvl === undefined ? "?? TVL UNKNOWN" : r.tvl < SMALL_TVL_USD ? "!! SMALL - UPDATE" : "ok"
    console.log(`\n${flag.padEnd(18)} ${usd(r.tvl).padStart(15)}  ${r.address}  ${r.label}`)
    console.log(`    markets: ${[...r.markets].join(", ")}`)
    for (const path of r.paths) console.log(`    path:    ${path}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
