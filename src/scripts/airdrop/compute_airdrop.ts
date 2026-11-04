import { readFileSync, writeFileSync } from "fs"
import { PrismaClient } from "@prisma/client"
import { formatUnits, isAddress } from "ethers"

const DIR = "src/scripts/airdrop"
const E18 = 10n ** 18n
const TOTAL = 10_000_000n * E18
// basis points of 0.01% => 1n = 0.01%
const pct = (hundredths: bigint) => (TOTAL * hundredths) / 10_000n

const BUDGETS = {
  cvgPepes: pct(25n),
  partners: pct(50n),
  preDeposit: pct(200n),
  creditors: pct(400n),
  lpPoints: pct(1000n),
  votePoints: pct(200n),
  cvgUsers: pct(1500n),
}
// Outside the merkle: the DAO already holds its tokens, the team is distributed by hand
const DAO = pct(5490n)
const TEAM = pct(1135n)
type Category = keyof typeof BUDGETS

const readJson = (file: string) => JSON.parse(readFileSync(`${DIR}/${file}`, "utf8"))

const sum = (weights: Map<string, bigint>) => [...weights.values()].reduce((a, b) => a + b, 0n)

function proRata(weights: Map<string, bigint>, budget: bigint) {
  const total = sum(weights)
  const out = new Map<string, bigint>()
  if (total === 0n) return out
  for (const [addr, w] of weights) if (w > 0n) out.set(addr, (budget * w) / total)
  return out
}

function addWeight(map: Map<string, bigint>, addr: string, w: bigint) {
  const key = addr.toLowerCase()
  map.set(key, (map.get(key) ?? 0n) + w)
}

type Info = Record<string, string | number>

async function main() {
  const prisma = new PrismaClient()
  const allocations = {} as Record<Category, Map<string, bigint>>
  // Per category, per address: the raw data the allocation was computed from
  const infos = Object.fromEntries(Object.keys(BUDGETS).map((c) => [c, new Map<string, Info>()])) as Record<Category, Map<string, Info>>
  const setInfo = (category: Category, addr: string, info: Info) => {
    const key = addr.toLowerCase()
    infos[category].set(key, { ...infos[category].get(key), ...info })
  }
  const unresolved: { name: string; category: Category; tan: string }[] = []

  // Fixed allocations from JSON, null addresses go to unresolved
  for (const category of ["partners", "creditors"] as const) {
    allocations[category] = new Map()
    for (const { person, allocation, address } of readJson(`${category}.json`)) {
      const tan = BigInt(allocation) * E18
      if (!address) {
        unresolved.push({ name: person, category, tan: tan.toString() })
        continue
      }
      addWeight(allocations[category], address, tan)
      setInfo(category, address, { name: person })
    }
  }

  const pepes = readJson("cvgPepe-holders.json")
  const pepeWeights = new Map<string, bigint>()
  for (const [addr, nfts] of Object.entries(pepes.holders)) {
    addWeight(pepeWeights, addr, BigInt(nfts as number))
    setInfo("cvgPepes", addr, { nfts: nfts as number, totalNfts: pepes.total })
  }
  allocations.cvgPepes = proRata(pepeWeights, BUDGETS.cvgPepes)

  allocations.cvgUsers = new Map()
  for (const { address, tan, ...balances } of readJson("recap.json")) {
    addWeight(allocations.cvgUsers, address, BigInt(tan))
    // Only keep non-zero CVG balances (holders, lockers, stakers, seed, ...)
    setInfo("cvgUsers", address, Object.fromEntries(Object.entries(balances).filter(([, v]) => v !== "0").map(([k, v]) => [k, formatUnits(v as string, 18)])))
  }

  try {
    // Pre-deposit: current accounted LP balance, summed over all USG LPs
    const preDepositWeights = new Map<string, bigint>()
    const balances = await prisma.accounted_balances.findMany({ include: { usg_lp: { select: { lp_name: true } } } })
    for (const { user_address, balance_lp, usg_lp } of balances) {
      addWeight(preDepositWeights, user_address, BigInt(balance_lp))
      setInfo("preDeposit", user_address, { [usg_lp.lp_name]: formatUnits(balance_lp, 18) })
    }
    for (const [addr, total] of preDepositWeights) setInfo("preDeposit", addr, { totalLp: formatUnits(total, 18) })
    allocations.preDeposit = proRata(preDepositWeights, BUDGETS.preDeposit)

    // LP points: base + booster + referral, minus excluded users
    const excluded = new Set((await prisma.lp_points_users_excluded.findMany()).map((e) => e.user.toLowerCase()))
    const lpWeights = new Map<string, bigint>()
    const lpPoints = await prisma.lp_user_points.groupBy({ by: ["user_address"], _sum: { points: true, booster_points: true } })
    for (const { user_address, _sum } of lpPoints) {
      addWeight(lpWeights, user_address, (_sum.points ?? 0n) + (_sum.booster_points ?? 0n))
      setInfo("lpPoints", user_address, { points: String(_sum.points ?? 0n), boosterPoints: String(_sum.booster_points ?? 0n) })
    }

    // Votes: task points + referral
    const voteWeights = new Map<string, bigint>()
    const votePoints = await prisma.vote_user_tasks.groupBy({ by: ["user_address"], _sum: { points: true } })
    for (const { user_address, _sum } of votePoints) {
      addWeight(voteWeights, user_address, _sum.points ?? 0n)
      setInfo("votePoints", user_address, { points: String(_sum.points ?? 0n) })
    }

    const referrals = await prisma.user.findMany({
      where: { OR: [{ lp_referral_points: { gt: 0 } }, { vote_referral_points: { gt: 0 } }] },
      select: { address: true, lp_referral_points: true, vote_referral_points: true },
    })
    for (const { address, lp_referral_points, vote_referral_points } of referrals) {
      addWeight(lpWeights, address, lp_referral_points)
      addWeight(voteWeights, address, vote_referral_points)
      if (lp_referral_points > 0n) setInfo("lpPoints", address, { referralPoints: String(lp_referral_points) })
      if (vote_referral_points > 0n) setInfo("votePoints", address, { referralPoints: String(vote_referral_points) })
    }
    for (const addr of excluded) lpWeights.delete(addr)
    for (const [addr, total] of lpWeights) setInfo("lpPoints", addr, { totalPoints: String(total), campaignTotalPoints: String(sum(lpWeights)) })
    for (const [addr, total] of voteWeights) setInfo("votePoints", addr, { totalPoints: String(total), campaignTotalPoints: String(sum(voteWeights)) })

    allocations.lpPoints = proRata(lpWeights, BUDGETS.lpPoints)
    allocations.votePoints = proRata(voteWeights, BUDGETS.votePoints)
  } finally {
    await prisma.$disconnect()
  }

  // Merge per address
  const recipients = new Map<string, { tan: bigint; details: Partial<Record<Category, bigint>> }>()
  for (const category of Object.keys(BUDGETS) as Category[]) {
    for (const [addr, tan] of allocations[category]) {
      if (tan === 0n) continue
      const r = recipients.get(addr) ?? { tan: 0n, details: {} }
      r.tan += tan
      r.details[category] = (r.details[category] ?? 0n) + tan
      recipients.set(addr, r)
    }
  }

  // Drop addresses below 1 TAN, their share goes back to the DAO
  let belowMinimum = 0
  for (const [addr, r] of recipients) {
    if (r.tan < E18) {
      recipients.delete(addr)
      belowMinimum++
    }
  }

  const summary = {} as Record<Category, { budget: string; distributed: string; unresolved: string; recipients: number }>
  let undistributed = 0n

  for (const category of Object.keys(BUDGETS) as Category[]) {
    let distributed = 0n
    let count = 0
    for (const { details } of recipients.values()) {
      if (details[category] === undefined) continue
      distributed += details[category]
      count++
    }
    const unresolvedTan = unresolved.filter((u) => u.category === category).reduce((a, u) => a + BigInt(u.tan), 0n)
    const budget = BUDGETS[category]
    if (distributed + unresolvedTan > budget) throw new Error(`${category} over budget: ${distributed + unresolvedTan} > ${budget}`)
    undistributed += budget - distributed - unresolvedTan
    summary[category] = {
      budget: budget.toString(),
      distributed: distributed.toString(),
      unresolved: unresolvedTan.toString(),
      recipients: count,
    }
  }

  const sorted = [...recipients.entries()]
    .sort(([, a], [, b]) => (b.tan > a.tan ? 1 : b.tan < a.tan ? -1 : 0))
    .map(([address, { tan, details }]) => ({
      address,
      tan: tan.toString(),
      tanFormatted: formatUnits(tan, 18),
      details: Object.fromEntries(
        Object.entries(details).map(([k, v]) => [k, { tan: formatUnits(v!, 18), ...infos[k as Category].get(address) }]),
      ),
    }))

  // Invalid addresses would break the merkle, flag them loudly
  const invalid = sorted.filter((r) => !isAddress(r.address))
  if (invalid.length) console.warn(`⚠️ ${invalid.length} invalid address(es): ${invalid.map((r) => r.address).join(", ")}`)

  const distributedTotal = sorted.reduce((a, r) => a + BigInt(r.tan), 0n)
  const unresolvedTotal = unresolved.reduce((a, u) => a + BigInt(u.tan), 0n)
  // Leftovers (partner remainder, rounding dust, empty campaigns, addresses below 1 TAN) go back to the DAO
  const dao = DAO + undistributed
  if (distributedTotal + unresolvedTotal + dao + TEAM !== TOTAL) throw new Error("Allocation does not sum to total supply")

  writeFileSync(
    `${DIR}/airdrop.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        summary: {
          ...summary,
          dao: { base: DAO.toString(), leftovers: undistributed.toString(), total: dao.toString() },
          teamOutsideMerkle: TEAM.toString(),
          distributedTotal: distributedTotal.toString(),
          unresolvedTotal: unresolvedTotal.toString(),
          total: TOTAL.toString(),
        },
        recipients: sorted,
        unresolved,
      },
      null,
      2,
    ),
  )

  console.log(`${sorted.length} recipients (${belowMinimum} dropped below 1 TAN), ${formatUnits(distributedTotal, 18)} TAN distributed`)
  console.log(`${unresolved.length} unresolved (${formatUnits(unresolvedTotal, 18)} TAN), DAO ${formatUnits(dao, 18)} TAN, team (by hand) ${formatUnits(TEAM, 18)} TAN`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
