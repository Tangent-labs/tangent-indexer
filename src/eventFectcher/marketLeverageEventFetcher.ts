import { ethers, JsonRpcProvider, Log, AddressLike } from "ethers"
import { getEthLogs } from "./_baseFectcher"

interface LeverageEvent {
  market: AddressLike
  account: AddressLike
  stakedAmount: string
  collatBought: string
  borrowedAmount: string
  timestamp: Date
  blockId: number
}

interface ZapLeverageEvent {
  market: AddressLike
  account: AddressLike
  stakedAmount: string
  collatZapDeposit: string
  collatLeverage: string
  borrowedAmount: string
  tokenIn: string
  amountIn: string
  timestamp: Date
  blockId: number
}

const LEVERAGE_EVENT_SIGNATURES = {
  Leverage: ethers.id("Leverage(address,uint256,uint256,uint256)"),
  ZapLeverage: ethers.id("ZapLeverage(address,uint256,uint256,uint256,uint256,address,uint256)"),
}

const LEVERAGE_TOPIC = ethers.keccak256(ethers.toUtf8Bytes("Leverage(address,uint256,uint256,uint256)"))
const ZAP_LEVERAGE_TOPIC = ethers.keccak256(ethers.toUtf8Bytes("ZapLeverage(address,uint256,uint256,uint256,uint256,address,uint256)"))

const parseLeverageEvent = (log: Log): LeverageEvent => {
  const account = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1])?.at(0) as AddressLike
  const [stakedAmount, collatBought, borrowedAmount] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "uint256"], log.data)
  return {
    market: log.address,
    account,
    stakedAmount: stakedAmount.toString(),
    collatBought: collatBought.toString(),
    borrowedAmount: borrowedAmount.toString(),
    timestamp: new Date(), // placeholder
    blockId: 22531382, // placeholder
  }
}

const parseZapLeverageEvent = (log: Log): ZapLeverageEvent => {
  const account = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1])?.at(0) as AddressLike
  const [stakedAmount, collatZapDeposit, collatLeverage, borrowedAmount, tokenIn, amountIn] = ethers.AbiCoder.defaultAbiCoder().decode(
    ["uint256", "uint256", "uint256", "uint256", "address", "uint256"],
    log.data
  )
  return {
    market: log.address,
    account,
    stakedAmount: stakedAmount.toString(),
    collatZapDeposit: collatZapDeposit.toString(),
    collatLeverage: collatLeverage.toString(),
    borrowedAmount: borrowedAmount.toString(),
    tokenIn: tokenIn.toString(),
    amountIn: amountIn.toString(),
    timestamp: new Date(), // placeholder
    blockId: 22531382, // placeholder
  }
}

export const fetchMarketLeverageLogs = async (
  provider: JsonRpcProvider,
  startingBlock: number,
  endingBlock: number,
  contracts: AddressLike[]
): Promise<{
  leverageLogs: LeverageEvent[]
  zapLeverageLogs: ZapLeverageEvent[]
}> => {
  try {
    const logs = await getEthLogs(provider, startingBlock, endingBlock, contracts, [LEVERAGE_EVENT_SIGNATURES.Leverage, LEVERAGE_EVENT_SIGNATURES.ZapLeverage])

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

    const leverageLogs: LeverageEvent[] = []
    const zapLeverageLogs: ZapLeverageEvent[] = []

    for (const log of logs) {
      const timestamp = blockTimestamps.get(log.blockNumber)
      const blockNumber = blockNumbers.get(log.blockNumber)
      if (log.topics[0] === LEVERAGE_TOPIC) {
        const leverageEvent = parseLeverageEvent(log)
        leverageEvent.timestamp = new Date(timestamp!)
        leverageEvent.blockId = blockNumber!
        leverageLogs.push(leverageEvent)
      } else if (log.topics[0] === ZAP_LEVERAGE_TOPIC) {
        const zapLeverageEvent = parseZapLeverageEvent(log)
        zapLeverageEvent.timestamp = new Date(timestamp!)
        zapLeverageEvent.blockId = blockNumber!
        zapLeverageLogs.push(zapLeverageEvent)
      }
    }

    return { leverageLogs, zapLeverageLogs }
  } catch (error) {
    console.error("Error fetching market deposit logs:", error)
    throw error
  }
}
