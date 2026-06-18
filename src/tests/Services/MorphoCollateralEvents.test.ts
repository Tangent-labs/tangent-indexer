import { describe, expect, it } from "vitest"
import { AbiCoder, JsonRpcProvider, Log, parseEther, ZeroAddress } from "ethers"

import {
  fetchMorphoCollateralLogs,
  MORPHO_COLLATERAL_TOPICS,
  morphoMarketSyntheticTokenAddress,
  parseMorphoLiquidateEvent,
  parseMorphoSupplyCollateralEvent,
  parseMorphoWithdrawCollateralEvent,
} from "../../eventFectcher/morphoCollateralEventFetcher.js"
import { UserPointsService } from "../../services/events/UserPointsService.js"
import { UserPointsLPRepository } from "../../db/Points/UserPointsLPRepository.js"
import { ERC20Repository } from "../../db/ERC20Repository.js"
import { ActiveBorrowersRepository } from "../../db/ActiveBorrowersRepository.js"

const MORPHO_SINGLETON = "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb"
const MARKET_ID = "0x2a2f62fe3d123077da35f281fbe69ebc296759b34873d627cf44c94f05fecf7e"
const SYNTHETIC_TOKEN = "0x2a2f62fe3d123077da35f281fbe69ebc296759b3"

const caller = "0x4838b106fce9647bdf1e7877bf73ce8b0bad5f97"
const onBehalf = "0x16c473448e770ff647c69cbe19e28528877fba1b"
const receiver = "0x90f79bf6eb2c4f870365e785982e1f101e93b906"

const abi = AbiCoder.defaultAbiCoder()

function buildMorphoLog(topic0: string, indexedTopics: string[], data: string, blockNumber = 100) {
  return new Log(
    {
      topics: [topic0, MARKET_ID, ...indexedTopics],
      address: MORPHO_SINGLETON,
      blockHash: "12",
      blockNumber,
      data,
      index: 1,
      removed: false,
      transactionHash: "0x",
      transactionIndex: 2,
    },
    new JsonRpcProvider()
  )
}

function addressTopic(address: string) {
  return abi.encode(["address"], [address])
}

describe("morphoCollateralEventFetcher parsers", () => {
  it("derives the synthetic token address from the market id", () => {
    expect(morphoMarketSyntheticTokenAddress(MARKET_ID)).toBe(SYNTHETIC_TOKEN)
  })

  it("returns no logs without calling the RPC when no market id is configured (empty topic = wildcard)", async () => {
    const provider = { send: () => Promise.reject(new Error("must not be called")) } as any
    expect(await fetchMorphoCollateralLogs(provider, 1, 100, MORPHO_SINGLETON, [])).toEqual([])
  })

  it("parses SupplyCollateral as a mint to onBehalf", () => {
    const log = buildMorphoLog(
      MORPHO_COLLATERAL_TOPICS.SupplyCollateral,
      [addressTopic(caller), addressTopic(onBehalf)],
      abi.encode(["uint256"], [parseEther("100")])
    )

    const event = parseMorphoSupplyCollateralEvent(log)

    expect(event.token_address).toBe(SYNTHETIC_TOKEN)
    expect(event.from).toBe(ZeroAddress.toLowerCase())
    expect(event.to).toBe(onBehalf)
    expect(event.amount).toBe(parseEther("100").toString())
    expect(event.block_id).toBe(100)
  })

  it("parses WithdrawCollateral as a burn on onBehalf (caller is not indexed)", () => {
    const log = buildMorphoLog(
      MORPHO_COLLATERAL_TOPICS.WithdrawCollateral,
      [addressTopic(onBehalf), addressTopic(receiver)],
      abi.encode(["address", "uint256"], [caller, parseEther("40")])
    )

    const event = parseMorphoWithdrawCollateralEvent(log)

    expect(event.token_address).toBe(SYNTHETIC_TOKEN)
    expect(event.from).toBe(onBehalf)
    expect(event.to).toBe(ZeroAddress.toLowerCase())
    expect(event.amount).toBe(parseEther("40").toString())
  })

  it("parses Liquidate as a burn of seizedAssets on the borrower", () => {
    const log = buildMorphoLog(
      MORPHO_COLLATERAL_TOPICS.Liquidate,
      [addressTopic(caller), addressTopic(onBehalf)],
      abi.encode(["uint256", "uint256", "uint256", "uint256", "uint256"], [parseEther("50"), parseEther("49"), parseEther("55"), 0n, 0n])
    )

    const event = parseMorphoLiquidateEvent(log)

    expect(event.token_address).toBe(SYNTHETIC_TOKEN)
    expect(event.from).toBe(onBehalf)
    expect(event.to).toBe(ZeroAddress.toLowerCase())
    expect(event.amount).toBe(parseEther("55").toString())
  })
})

describe("UserPointsService.sortMorphoCollateralLogs", () => {
  const userPointsService = new UserPointsService({} as any as UserPointsLPRepository, {} as any as ERC20Repository, {} as any as ActiveBorrowersRepository)

  it("recomposes transfer events from supply, withdraw and liquidate logs", () => {
    const supply = buildMorphoLog(
      MORPHO_COLLATERAL_TOPICS.SupplyCollateral,
      [addressTopic(caller), addressTopic(onBehalf)],
      abi.encode(["uint256"], [parseEther("100")]),
      100
    )
    const withdraw = buildMorphoLog(
      MORPHO_COLLATERAL_TOPICS.WithdrawCollateral,
      [addressTopic(onBehalf), addressTopic(receiver)],
      abi.encode(["address", "uint256"], [caller, parseEther("40")]),
      101
    )
    const liquidate = buildMorphoLog(
      MORPHO_COLLATERAL_TOPICS.Liquidate,
      [addressTopic(caller), addressTopic(onBehalf)],
      abi.encode(["uint256", "uint256", "uint256", "uint256", "uint256"], [parseEther("50"), parseEther("49"), parseEther("60"), 0n, 0n]),
      101
    )

    const { transferEvents, morphoEventsBlockIds } = userPointsService.sortMorphoCollateralLogs([supply, withdraw, liquidate])

    expect(transferEvents.length).toBe(3)
    expect(morphoEventsBlockIds.length).toBe(2)
    expect(transferEvents.every((event) => event.token_address === SYNTHETIC_TOKEN)).toBe(true)
  })

  it("skips zero amounts and unexpected topics", () => {
    const zeroSupply = buildMorphoLog(MORPHO_COLLATERAL_TOPICS.SupplyCollateral, [addressTopic(caller), addressTopic(onBehalf)], abi.encode(["uint256"], [0n]))
    const unexpected = buildMorphoLog("0x" + "ab".repeat(32), [addressTopic(caller), addressTopic(onBehalf)], abi.encode(["uint256"], [parseEther("1")]))

    const { transferEvents, morphoEventsBlockIds } = userPointsService.sortMorphoCollateralLogs([zeroSupply, unexpected])

    expect(transferEvents.length).toBe(0)
    expect(morphoEventsBlockIds.length).toBe(0)
  })
})
