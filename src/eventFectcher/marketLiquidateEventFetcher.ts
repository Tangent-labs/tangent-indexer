import { ethers, JsonRpcProvider, Log, AddressLike } from "ethers"
import { getEthLogs } from "./_baseFectcher"

interface LiquidateEvent {
  market: AddressLike
  account: AddressLike
  repaidAmount: string
  fee: string
  collateralLiquidated: string
  liquidator: AddressLike
  timestamp: Date
  blockId: number
  txHash: string
}

interface SelfLiquidateEvent {
  market: AddressLike
  account: AddressLike
  repaidAmount: string
  collateralLiquidated: string
  liquidator: AddressLike
  timestamp: Date
  blockId: number
  txHash: string
}

const LIQUIDATE_EVENT_SIGNATURES = {
  Liquidate: ethers.id("Liquidate(address,uint256,uint256,uint256, address)"),
  SelfLiquidate: ethers.id("SelfLiquidate(address,uint256,uint256,address)"),
}

const LIQUIDATE_TOPIC = ethers.keccak256(ethers.toUtf8Bytes("Liquidate(address,uint256,uint256,uint256,address)"))
const SELF_LIQUIDATE_TOPIC = ethers.keccak256(ethers.toUtf8Bytes("SelfLiquidate(address,uint256,uint256,address)"))

const parseLiquidateEvent = (log: Log): LiquidateEvent => {
  const account = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1])?.at(0) as AddressLike
  const [repaidAmount, fee, collateralLiquidated, liquidator] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "uint256", "address"], log.data)
  return {
    market: log.address,
    account,
    repaidAmount: repaidAmount.toString(),
    fee: fee.toString(),
    collateralLiquidated: collateralLiquidated.toString(),
    liquidator,
    timestamp: new Date(),
    blockId: 22531382,
    txHash: log.transactionHash,
  }
}

const parseSelfLiquidate = (log: Log): SelfLiquidateEvent => {
  const account = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1])?.at(0) as AddressLike
  const [repaidAmount, collateralLiquidated, liquidator] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "address"], log.data)

  return {
    market: log.address,
    account,
    repaidAmount: repaidAmount.toString(),
    collateralLiquidated: collateralLiquidated.toString(),
    liquidator,
    timestamp: new Date(),
    blockId: 22531382,
    txHash: log.transactionHash,
  }
}

export const fetchMarketLiquidateLogs = async (
  provider: JsonRpcProvider,
  startingBlock: number,
  endingBlock: number,
  contracts: AddressLike[]
): Promise<{
  liquidateLogs: LiquidateEvent[]
  selfLiquidateLogs: SelfLiquidateEvent[]
}> => {
  try {
    const logs = await getEthLogs(provider, startingBlock, endingBlock, contracts, [
      LIQUIDATE_EVENT_SIGNATURES.Liquidate,
      LIQUIDATE_EVENT_SIGNATURES.SelfLiquidate,
    ])

    const blockTimestamps = new Map<number, number>()
    const blockNumbers = new Map<number, number>()
    const uniqueBlockNumbers = [...new Set(logs.map((log) => log.blockNumber))]

    for (const blockNumber of uniqueBlockNumbers) {
      const block = await provider.getBlock(blockNumber)

      if (block && block.timestamp) {
        blockTimestamps.set(blockNumber, block.timestamp * 1000)
      }

      if (block && block.number) {
        blockNumbers.set(blockNumber, block.number)
      }
    }

    const liquidateLogs: LiquidateEvent[] = []
    const selfLiquidateLogs: SelfLiquidateEvent[] = []

    for (const log of logs) {
      const timestamp = blockTimestamps.get(log.blockNumber)
      const blockNumber = blockNumbers.get(log.blockNumber)
      if (log.topics[0] === LIQUIDATE_TOPIC) {
        const liquidateEvent = parseLiquidateEvent(log)
        liquidateEvent.timestamp = new Date(timestamp!)
        liquidateEvent.blockId = blockNumber!
        liquidateLogs.push(liquidateEvent)
      } else if (log.topics[0] === SELF_LIQUIDATE_TOPIC) {
        const selfLiquidateEvent = parseSelfLiquidate(log)
        selfLiquidateEvent.timestamp = new Date(timestamp!)
        selfLiquidateEvent.blockId = blockNumber!
        selfLiquidateLogs.push(selfLiquidateEvent)
      }
    }

    return { liquidateLogs, selfLiquidateLogs }
  } catch (error) {
    console.error("Error fetching market liquidate logs:", error)
    throw error
  }
}
