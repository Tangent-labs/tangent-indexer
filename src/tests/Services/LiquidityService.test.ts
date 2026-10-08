import { describe, it, expect, vi } from "vitest"
import { parseEther, Provider } from "ethers"
import { LiquidityService } from "../../services/globalData/LiquidityService.js"
import { LiquidityRepository } from "../../db/LiquidityRepository.js"

const LPS = [
  { id: 1n, lp_name: "USG-USDC", lp_address: "0x0000000000000000000000000000000000000001" },
  { id: 2n, lp_name: "USG-frxUSD", lp_address: "0x0000000000000000000000000000000000000002" },
  { id: 3n, lp_name: "msUSD-USG", lp_address: "0x0000000000000000000000000000000000000003" },
]

describe("LiquidityService.buildLpLiquidityRows", () => {
  it("values each pool as LP supply times LP price, skipping undeployed and unpriced pools", async () => {
    const repository = {
      getUsgLps: vi.fn().mockResolvedValue(LPS),
      // USG-frxUSD has no price feed yet
      getLpPriceAt: vi.fn().mockImplementation(async (address: string) => (address === LPS[1].lp_address ? undefined : 1.02)),
    } as any as LiquidityRepository

    const provider = {
      // msUSD-USG is not deployed yet at that block
      getCode: vi.fn().mockImplementation(async (address: string) => (address === LPS[2].lp_address ? "0x" : "0x60")),
      // totalSupply() = 1000 LP
      call: vi.fn().mockResolvedValue("0x" + parseEther("1000").toString(16).padStart(64, "0")),
    } as any as Provider

    const date = new Date("2026-05-01T00:00:00Z")
    const rows = await new LiquidityService(repository).buildLpLiquidityRows(provider, date, 123)

    expect(rows).toEqual([{ usg_lp_id: 1n, date, liquidity_usd: 1020 }])
    expect(vi.mocked(provider.call).mock.calls[0][0]).toMatchObject({ blockTag: 123 })
  })
})
