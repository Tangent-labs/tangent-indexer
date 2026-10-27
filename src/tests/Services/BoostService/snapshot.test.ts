import { ContractFactory, getAddress, hexlify, JsonRpcProvider, randomBytes } from "ethers"
import { beforeEach, describe, expect, it, vi } from "vitest"
import BoostBalancesSnapshots from "../../../abis/BoostBalancesSnapshots.json" with { type: "json" }
import { BoostRepository } from "../../../db/Points/BoostRepository.js"
import { BoostService } from "../../../services/boost/BoostService.js"
import { SNAPSHOT_BOOST_TOKENS } from "../../../services/boost/config.js"
import { chainView } from "../../../utils/chainView.js"

vi.mock("../../../utils/chainView.js", () => ({ chainView: vi.fn() }))

const randomAddresses = (n: number) => Array.from({ length: n }, () => hexlify(randomBytes(20)))

describe("BoostService onchain snapshot", () => {
  const chainViewMock = vi.mocked(chainView)
  const boostRepository = { getBoostSubscribers: vi.fn() } as any as BoostRepository
  let boostService: BoostService

  beforeEach(() => {
    vi.clearAllMocks()
    boostService = new BoostService({} as JsonRpcProvider, boostRepository)
    // Echo back one snapshot row per user, timestamp = call index
    let call = 0
    chainViewMock.mockImplementation(async (_p, _a, _b, params: any) => [BigInt(++call), params[1].map((user: string) => ({ user, tokenBalance: [] }))])
  })

  it("Should fit 1000 users under the 49152 bytes initcode limit", async () => {
    const factory = new ContractFactory(BoostBalancesSnapshots.abi, BoostBalancesSnapshots.bytecode)
    const tx = await factory.getDeployTransaction(SNAPSHOT_BOOST_TOKENS, randomAddresses(1000))
    expect((tx.data.length - 2) / 2).toBeLessThan(49152)
  })

  it("Should split users in batches of 1000 and merge results in order", async () => {
    const users = randomAddresses(2500)
    const { timestamp, snapshot } = await boostService.getOnchainBalancesSnapshot(users)

    expect(chainViewMock.mock.calls.map((c: any) => c[3][1].length)).toEqual([1000, 1000, 500])
    expect(snapshot.map((s) => s.user)).toEqual(users)
    expect(timestamp).toBe(1n)
  })

  it("Should still call once with no users", async () => {
    const { timestamp, snapshot } = await boostService.getOnchainBalancesSnapshot([])

    expect(chainViewMock).toHaveBeenCalledTimes(1)
    expect(snapshot).toEqual([])
    expect(timestamp).toBe(1n)
  })

  it("Should dedupe and drop invalid / system addresses before the snapshot", async () => {
    const valid = getAddress(hexlify(randomBytes(20)))
    vi.spyOn(boostRepository as any, "getBoostSubscribers").mockResolvedValue(
      [valid, valid.toLowerCase(), "0x0000000000000000000000000000000000000102", "0x0000000000000000000000000000000000000000", "0x123", null].map(
        (user_address) => ({ user_address })
      )
    )
    const snapshotSpy = vi.spyOn(boostService, "getOnchainBalancesSnapshot").mockRejectedValue(new Error("stop"))

    await expect(boostService.updateBoosts()).rejects.toThrow("stop")
    expect(snapshotSpy).toHaveBeenCalledWith([valid.toLowerCase()])
  })
})
