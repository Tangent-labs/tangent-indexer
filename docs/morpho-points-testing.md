# Morpho collateral points — testing & rollout guide

Points for sUSG supplied as collateral on the Morpho Blue sUSG/frxUSD market.
Morpho is a singleton and collateral positions are not ERC20 balances, so the indexer
recomposes synthetic `transfer_events` from `SupplyCollateral` (mint to `onBehalf`),
`WithdrawCollateral` (burn on `onBehalf`) and `Liquidate` (burn of `seizedAssets` on the
borrower), filtered by market id. The synthetic `token_address` is the first 20 bytes of
the market id and must be registered in `tracked_erc20` (the onboarding script does it).

Key files:

| Side      | File                                                | Role                                                                                               |
| --------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| indexer   | `src/eventFectcher/morphoCollateralEventFetcher.ts` | topics, fetchers, parsers — single source of the recomposition                                     |
| indexer   | `src/scripts/db/add-new/add-new-lp-tasks-morpho.ts` | onboarding: task + tracked token + exclusion + backfill + segment replay                           |
| indexer   | `src/scripts/utils/check_morpho_context.ts`         | automated assertions against the ground truth and the raw chain                                    |
| contracts | `js-scripts/hardhat/USG/contexts/MorphoContext.ts`  | market setup + scenario suite (market creation, supplies, onBehalf, loops, liquidations, bad debt) |
| contracts | `js-scripts/hardhat/USG/scripts/morphoSetUp.ts`     | full scenario runner (`npm run morpho-context`), writes the ground truth file                      |
| contracts | `js-scripts/hardhat/USG/actions/morphoActions.ts`   | composable actions for ad-hoc sequences in `generated-actions.ts`                                  |

## Prerequisites

- Local Postgres reachable via `DATABASE_URL`, `.env` with `ENV=local`, `CHAIN_ID=31337`,
  `CHAIN_RPCS=http://127.0.0.1:8545/`, `STARTING_BLOCK=25277148`.
- `tangent-contracts` as a sibling directory (the checker reads
  `../tangent-contracts/morpho-context.json` by default).

## 1. Set up the chain context (tangent-contracts)

```bash
cd ../tangent-contracts
npm run hh-node            # terminal 1: mainnet fork on 127.0.0.1:8545
npm run morpho-context     # terminal 2: creates the market + runs the scenarios
# subsets: MORPHO_SCENARIOS=simple,onbehalf,loop,liquidation,baddebt npm run morpho-context
# reruns reuse the market and append a new wave of events
```

The script re-creates the prod market with byte-identical params (same deterministic
market id as mainnet; a mock oracle bytecode is injected at the real oracle address) and
writes `morpho-context.json` — the ground truth: every step with block, tx and decoded args.

**Living example**: `npm run morpho-example-scenario` (in tangent-contracts) replays the full
reference suite — simple flow, onBehalf, leverage loop, partial liquidation, bad-debt seizure —
written with the composable actions (`js-scripts/hardhat/USG/scripts/morphoExampleScenario.ts`).
Start from it, copy it, trim it.

**Ad-hoc alternative**: write your own sequence in `generated-actions.ts` with the composable
Morpho actions — same pattern as the Curve/Pendle ones. The first action sets the market up
lazily; amounts are token units:

```ts
import {
  morphoSupplyCollateral,
  morphoWithdrawCollateral,
  morphoBorrow,
  morphoSeedLoanLiquidity,
  morphoLiquidatePartial,
  morphoRestoreOraclePrice,
  morphoSaveSummary,
} from "../actions/morphoActions"

const [, , user2, user3] = await ethers.getSigners()
await morphoSeedLoanLiquidity(200000)
await morphoSupplyCollateral(user2, 10000)
await morphoBorrow(user2, 5000)
await morphoSupplyCollateral(user3, 5000, user2) // on behalf of user2
await morphoWithdrawCollateral(user2, 1000)
await morphoSaveSummary() // optional: writes morpho-context.json for the checker
```

The indexer-side checker does **not** require the ground truth file: without it, it runs in
chain-only mode (recomposes the expectations from raw logs). `morphoSaveSummary()` just adds
the independent step-by-step comparison on top.

**Sync the creation block**: the summary prints the `CreateMarket` block. Copy it into
`addresses.json` → `morpho.markets["sUSG-frxUSD"].creationBlock` (it shifts on every fresh
fork). The mainnet value used in the remote (public-files) addresses.json is `25286961`.

## 2. Path A — fresh environment

```bash
npm run prisma:push
npm run db:truncate && npm run db:seed-db
npm run db:add-morpho-lp-task          # no pointers yet -> no backfill, just provisioning
npm run tangent:indexer-block
npm run tangent:snapshot-prices
npm run tangent:indexer-points-lp
npx tsx src/scripts/utils/check_morpho_context.ts
```

## 3. Path B — prod rollout simulation (the important one)

Simulates prod history indexed _before_ the Morpho code/config existed, then the rollout:

```bash
# 1. hide the morpho config (= prod today), index history
#    (temporarily delete the "morpho" key from addresses.json)
npm run db:truncate && npm run db:seed-db
npm run tangent:indexer-block && npm run tangent:snapshot-prices && npm run tangent:indexer-points-lp

# 2. restore the morpho key, optionally run the indexer once BEFORE the script:
#    it must log "Morpho: 1 configured market(s) not in tracked_erc20, skipped" and not fail

# 3. onboard: backfills all events from market creation, replays segments,
#    excludes the singleton and closes its pre-existing hold-sUSG segment
npm run db:add-morpho-lp-task

# 4. let a couple of blocks pass, run the three indexers again, then assert
npx tsx src/scripts/utils/check_morpho_context.ts
```

## What the checker asserts

- every ground-truth event is in `transfer_events`, wei-exact, credited to `onBehalf`
  (never `caller`) / debited from the liquidated borrower;
- one open `lp_user_tasks` segment per user with a non-zero balance, amounts exact,
  segments closed/ordered/non-overlapping;
- no segments for the zero address or the Morpho singleton, singleton excluded from the
  hold-sUSG task;
- points > 0 for every open position;
- chain-vs-DB invariant: events and balances recomputed from raw `eth_getLogs` match the
  DB exactly (independent of the ground truth file).

## Prod rollout

1. Add the `morpho` section to public-files `addresses.json` (creationBlock `25286961`).
2. **Stop all indexers.**
3. Deploy the new indexer code.
4. `npm run db:add-morpho-lp-task` against the prod DB.
5. Restart the indexers, watch one cycle (no `Morpho: ... skipped` warning).

Order matters: deploy **before** the script (the script backfills up to the event pointer;
events emitted after a premature script run but before the deploy would be lost), and the
script runs **inside** the stopped window (it reads the pointers it backfills up to).
Running the indexer between deploy and script is safe: unprovisioned markets are skipped
with a warning, and the backfill covers the skipped ranges.

Sanity queries after rollout:

```sql
SELECT * FROM points.lp_task WHERE protocol = 'Morpho';
SELECT * FROM points.lp_points_users_excluded WHERE "user" = '0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb';
SELECT count(*) FROM events.transfer_events WHERE token_address = '0x2a2f62fe3d123077da35f281fbe69ebc296759b3';
SELECT user_address, amount FROM points.lp_user_tasks t
  JOIN points.lp_task lt ON lt.id = t.task_id
  WHERE lt.protocol = 'Morpho' AND t.closed_date IS NULL;
```
