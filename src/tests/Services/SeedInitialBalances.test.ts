import { describe, expect, it, vi } from "vitest"
import { ZeroAddress } from "ethers"

import { computeBalancesFromTransfers, verifyBalances, seedInitialLpUserTasks } from "../../scripts/db/add-new/utils/seedInitialBalances.js"
import { fetchAllTransferLogs, TransferLog } from "../../eventFectcher/etherscanTransferFetcher.js"

const alice = "0x1111111111111111111111111111111111111111"
const bob = "0x2222222222222222222222222222222222222222"
const gauge = "0x3333333333333333333333333333333333333333"
const TOKEN = "0x4444444444444444444444444444444444444444"

const transfer = (from: string, to: string, value: bigint, blockNumber = 1): TransferLog => ({ from, to, value, blockNumber })

describe("computeBalancesFromTransfers", () => {
  it("folds transfers into a net balance per address", () => {
    const balances = computeBalancesFromTransfers([transfer(ZeroAddress, alice, 100n, 1), transfer(alice, bob, 30n, 2), transfer(alice, bob, 10n, 3)])

    expect(balances.get(alice)).toBe(60n)
    expect(balances.get(bob)).toBe(40n)
  })

  it("credits mints without tracking the zero address", () => {
    const balances = computeBalancesFromTransfers([transfer(ZeroAddress, alice, 100n)])

    expect(balances.get(alice)).toBe(100n)
    expect(balances.has(ZeroAddress)).toBe(false)
  })

  it("debits burns and leaves the burner at zero", () => {
    const balances = computeBalancesFromTransfers([transfer(ZeroAddress, alice, 100n, 1), transfer(alice, ZeroAddress, 100n, 2)])

    expect(balances.get(alice)).toBe(0n)
    expect(balances.has(ZeroAddress)).toBe(false)
  })

  it("nets a round trip back to the original holder", () => {
    const balances = computeBalancesFromTransfers([transfer(ZeroAddress, alice, 100n, 1), transfer(alice, bob, 100n, 2), transfer(bob, alice, 100n, 3)])

    expect(balances.get(alice)).toBe(100n)
    expect(balances.get(bob)).toBe(0n)
  })
})

describe("fetchAllTransferLogs block range validation", () => {
  // Etherscan treats an unparseable toBlock as "latest" and returns data, so a NaN that
  // reaches the API comes back as head balances wearing a snapshot's clothes.
  it("rejects a NaN block rather than letting Etherscan default it to latest", async () => {
    await expect(fetchAllTransferLogs(1, TOKEN, 100, NaN)).rejects.toThrow(/toBlock must be a non-negative integer/)
    await expect(fetchAllTransferLogs(1, TOKEN, NaN, 100)).rejects.toThrow(/fromBlock must be a non-negative integer/)
  })

  it("rejects an inverted range", async () => {
    await expect(fetchAllTransferLogs(1, TOKEN, 200, 100)).rejects.toThrow(/fromBlock 200 is after toBlock 100/)
  })
})

describe("verifyBalances", () => {
  it("passes when the balances sum to totalSupply", () => {
    const balances = computeBalancesFromTransfers([transfer(ZeroAddress, alice, 100n, 1), transfer(alice, bob, 40n, 2)])

    expect(() => verifyBalances(balances, TOKEN, 500, 100n)).not.toThrow()
  })

  it("throws when an address ends negative, meaning a credit was missed", () => {
    // alice sends without ever having received: the mint log was not fetched.
    const balances = computeBalancesFromTransfers([transfer(alice, bob, 40n)])

    expect(() => verifyBalances(balances, TOKEN, 500, 0n)).toThrow(/negative balance/)
  })

  it("throws when a whole window is missing even though every balance stays positive", () => {
    // Only the mint was fetched; a later alice -> bob transfer was truncated away.
    // No balance is negative, so only the totalSupply check catches this.
    const balances = computeBalancesFromTransfers([transfer(ZeroAddress, alice, 100n, 1)])

    expect(() => verifyBalances(balances, TOKEN, 500, 250n)).toThrow(/sum to 100 but totalSupply at block 500 is 250/)
  })

  it("skips the supply check when no totalSupply is given", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const balances = computeBalancesFromTransfers([transfer(ZeroAddress, alice, 100n)])

    expect(() => verifyBalances(balances, TOKEN, 500, undefined)).not.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("skipping the totalSupply check"))
    warn.mockRestore()
  })
})

describe("seedInitialLpUserTasks", () => {
  const buildTx = () => ({
    user: { createMany: vi.fn() },
    lp_user_tasks: { createMany: vi.fn() },
  })

  it("opens a segment per holder and registers them as users", async () => {
    const tx = buildTx()
    const balances = new Map([
      [alice, 60n],
      [bob, 40n],
    ])
    const startDate = new Date("2026-07-16T00:00:00Z")

    const seeded = await seedInitialLpUserTasks(tx as never, 7n, balances, startDate, new Set())

    expect(seeded).toBe(2)
    // user rows must exist first: lp_user_points.user_address is an FK to user.address,
    // and insert_missing_user_points() fans lp_user_tasks out into lp_user_points.
    expect(tx.user.createMany).toHaveBeenCalledWith({
      data: [{ address: alice }, { address: bob }],
      skipDuplicates: true,
    })
    expect(tx.lp_user_tasks.createMany).toHaveBeenCalledWith({
      data: [
        { task_id: 7n, user_address: alice, start_date: startDate, closed_date: null, amount: "60" },
        { task_id: 7n, user_address: bob, start_date: startDate, closed_date: null, amount: "40" },
      ],
    })
  })

  it("skips excluded addresses so gauge-held balances are not double counted", async () => {
    const tx = buildTx()
    const balances = new Map([
      [alice, 60n],
      [gauge, 1000n],
    ])

    const seeded = await seedInitialLpUserTasks(tx as never, 7n, balances, new Date(), new Set([gauge]))

    expect(seeded).toBe(1)
    expect(tx.lp_user_tasks.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ user_address: alice })],
    })
  })

  it("skips zero balances rather than opening an empty segment", async () => {
    const tx = buildTx()
    const balances = new Map([
      [alice, 60n],
      [bob, 0n],
    ])

    const seeded = await seedInitialLpUserTasks(tx as never, 7n, balances, new Date(), new Set())

    expect(seeded).toBe(1)
    expect(tx.lp_user_tasks.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ user_address: alice })],
    })
  })

  it("writes nothing when there are no holders", async () => {
    const tx = buildTx()

    const seeded = await seedInitialLpUserTasks(tx as never, 7n, new Map(), new Date(), new Set())

    expect(seeded).toBe(0)
    expect(tx.user.createMany).not.toHaveBeenCalled()
    expect(tx.lp_user_tasks.createMany).not.toHaveBeenCalled()
  })
})
