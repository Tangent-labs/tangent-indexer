import { beforeEach, describe, expect, it, vi } from "vitest"

import { RouterService } from "../../services/RouterService.js"
import { LiquidationUserFullInfo } from "../../type/data.js"
import { getAddressesJson } from "../../utils/jsonReader.js"

vi.mock("../../utils/jsonReader.js", () => ({
  getAddressesJson: vi.fn(),
}))

describe("RouterService Enso route validation", () => {
  const account: LiquidationUserFullInfo = {
    account: "0x0000000000000000000000000000000000000001",
    market: "0x0000000000000000000000000000000000000002",
    collatToken: "0x0000000000000000000000000000000000000003",
    collateralBalance: 1000n,
    positionValue: 1000n,
    userDebt: 500n,
    healthRatio: 1n,
  }
  const receiver = "0x0000000000000000000000000000000000000004"
  const routerAddress = "0x0000000000000000000000000000000000000005"
  const zappingProxy = "0x0000000000000000000000000000000000000007"
  const routerCall = "0x1234"
  const provider = {
    estimateGas: vi.fn(),
  }
  const ensoRouterService = {
    getRoute: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAddressesJson).mockResolvedValue({
      tokens: { USG: "0x0000000000000000000000000000000000000006" },
      utilities: { zappingProxy },
    } as any)
    ensoRouterService.getRoute.mockResolvedValue({
      amountOut: 1500n,
      tx: { to: routerAddress, data: routerCall },
    })
  })

  it("requests an Enso route from the zapping proxy context", async () => {
    const service = new RouterService([provider as any], "0xCurve", "0xPendle", ensoRouterService as any)

    const result = await (service as any)._getEnsoRoute(account, receiver, 0n)

    expect(result.routerType).toBe("enso")
    expect(ensoRouterService.getRoute).toHaveBeenCalledWith({
      amountIn: account.collateralBalance,
      tokenIn: account.collatToken,
      tokenOut: "0x0000000000000000000000000000000000000006",
      fromAddress: zappingProxy,
      receiver,
      slippageBps: 0n,
    })
    expect(provider.estimateGas).not.toHaveBeenCalled()
  })

  it("keeps the custom route when its quote is higher than Enso", async () => {
    ensoRouterService.getRoute.mockResolvedValue({
      amountOut: 900n,
      tx: { to: routerAddress, data: routerCall },
    })
    const service = new RouterService([provider as any], "0xCurve", "0xPendle", ensoRouterService as any)
    vi.spyOn(service as any, "_getBestCurveRoute").mockResolvedValue({
      route: { display: "curve", params: { routeAddresses: [], swapParamsFull: [] } },
      amount: 1000n,
      priceImpact: 0,
    })

    const result = await service.getBestRoute(account, 0, receiver)

    expect(result.routerType).toBe("curve")
    expect(result.amount).toBe(1000n)
  })
})
