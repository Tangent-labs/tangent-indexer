import { ethers, JsonRpcProvider, Log, AddressLike } from "ethers"
import { getEthLogs } from "./_baseFectcher"

export interface RepayEvent {
  userAddress: AddressLike
  repayer: AddressLike
  repaidAmount: string
  timestamp: Date
}

export interface WithdrawEvent {
  account: AddressLike
  withdrawnAmount: string
  timestamp: Date
}

export interface RepayAndWithdrawEvent {
  userAddress: AddressLike
  repaidAmount: string
  withdrawnAmount: string
  timestamp: Date
}

export interface ZapRepayEvent {
  userAddress: AddressLike
  repayer: AddressLike
  repaidAmount: string
  tokenIn: string
  amountIn: string
  timestamp: Date
}

export interface ZapRepayAndWithdrawEvent {
  repayer: AddressLike
  repaidAmount: string
  withdrawnAmount: string
  tokenIn: string
  amountIn: string
  timestamp: Date
}

// Event signatures and topics
const REPAY_EVENT_SIGNATURES = {
  Repay: ethers.id("Repay(address,address,uint256)"),
  RepayAndWithdraw: ethers.id("RepayAndWithdraw(address,uint256,uint256)"),
  ZapRepay: ethers.id("ZapRepay(address,uint256,address,uint256)"),
  ZapRepayAndWithdraw: ethers.id("ZapRepayAndWithdraw(address,uint256,uint256,address,uint256)"),
  Withdraw: ethers.id("Withdraw(address,uint256)"),
}

const REPAY_TOPIC = ethers.keccak256(ethers.toUtf8Bytes("Repay(address,address,uint256)"))
const REPAY_AND_WITHDRAW_TOPIC = ethers.keccak256(ethers.toUtf8Bytes("RepayAndWithdraw(address,uint256,uint256)"))
const ZAP_REPAY_TOPIC = ethers.keccak256(ethers.toUtf8Bytes("ZapRepay(address,uint256,address,uint256)"))
const ZAP_REPAY_AND_WITHDRAW_TOPIC = ethers.keccak256(ethers.toUtf8Bytes("ZapRepayAndWithdraw(address,uint256,uint256,address,uint256)"))
const WITHDRAW_TOPIC = ethers.keccak256(ethers.toUtf8Bytes("Withdraw(address,uint256)"))

export const parseWithdrawEvent = (log: Log): WithdrawEvent => {
  const userRepayAddress = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1])?.at(0) as AddressLike
  const [withdrawnAmount] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], log.data)
  return {
    account: userRepayAddress,
    withdrawnAmount: withdrawnAmount.toString(),
    timestamp: new Date(), // placeholder
  }
}

export const parseRepayEvent = (log: Log): RepayEvent => {
  const userRepayAddress = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1])?.at(0) as AddressLike
  const [repaidAmount] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], log.data)
  return {
    repayer: userRepayAddress,
    userAddress: userRepayAddress,
    repaidAmount: repaidAmount.toString(),
    timestamp: new Date(), // placeholder
  }
}

export const parseRepayAndWithdrawEvent = (log: Log): RepayAndWithdrawEvent => {
  const userRepayAddress = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1])?.at(0) as AddressLike
  const [repaidAmount, withdrawnAmount] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "uint256"], log.data)
  return {
    userAddress: userRepayAddress,
    repaidAmount: repaidAmount.toString(),
    withdrawnAmount: withdrawnAmount.toString(),
    timestamp: new Date(), // placeholder
  }
}

export const parseZapRepayEvent = (log: Log): ZapRepayEvent => {
  const userRepayAddress = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1])?.at(0) as AddressLike
  const [repaidAmount, tokenIn, amountIn] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "address", "uint256"], log.data)
  return {
    userAddress: userRepayAddress,
    repayer: userRepayAddress,
    repaidAmount: repaidAmount.toString(),
    tokenIn,
    amountIn: amountIn.toString(),
    timestamp: new Date(), // placeholder
  }
}

export const parseZapRepayAndWithdrawEvent = (log: Log): ZapRepayAndWithdrawEvent => {
  const userRepayAddress = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1])?.at(0) as AddressLike
  const [repaidAmount, withdrawnAmount, tokenIn, amountIn] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "address", "uint256"], log.data)
  return {
    repayer: userRepayAddress,
    repaidAmount: repaidAmount.toString(),
    withdrawnAmount: withdrawnAmount.toString(),
    tokenIn,
    amountIn: amountIn.toString(),
    timestamp: new Date(), // placeholder
  }
}

export const fetchMarketRepayLogs = async (
  provider: JsonRpcProvider,
  startingBlock: number,
  endingBlock: number,
  contracts: AddressLike[]
): Promise<{
  repayLogs: RepayEvent[]
  withdrawLogs: WithdrawEvent[]
  repayAndWithdrawLogs: RepayAndWithdrawEvent[]
  zapRepayLogs: ZapRepayEvent[]
  zapRepayAndWithdrawLogs: ZapRepayAndWithdrawEvent[]
}> => {
  try {
    const logs = await getEthLogs(provider, startingBlock, endingBlock, contracts, [
      REPAY_EVENT_SIGNATURES.Repay,
      REPAY_EVENT_SIGNATURES.RepayAndWithdraw,
      REPAY_EVENT_SIGNATURES.ZapRepay,
      REPAY_EVENT_SIGNATURES.ZapRepayAndWithdraw,
      REPAY_EVENT_SIGNATURES.Withdraw,
    ])

    const blockTimestamps = new Map<number, number>()
    const uniqueBlockNumbers = [...new Set(logs.map((log) => log.blockNumber))]
    for (const blockNumber of uniqueBlockNumbers) {
      const block = await provider.getBlock(blockNumber)
      if (block && block.timestamp) {
        blockTimestamps.set(blockNumber, block.timestamp * 1000)
      }
    }

    const repayLogs: RepayEvent[] = []
    const repayAndWithdrawLogs: RepayAndWithdrawEvent[] = []
    const zapRepayLogs: ZapRepayEvent[] = []
    const zapRepayAndWithdrawLogs: ZapRepayAndWithdrawEvent[] = []
    const withdrawLogs: WithdrawEvent[] = []

    for (const log of logs) {
      const timestamp = blockTimestamps.get(log.blockNumber) || Date.now()
      if (log.topics[0] === REPAY_TOPIC) {
        const repayEvent = parseRepayEvent(log)
        repayEvent.timestamp = new Date(timestamp)
        repayLogs.push(repayEvent)
      } else if (log.topics[0] === REPAY_AND_WITHDRAW_TOPIC) {
        const repayAndWithdrawEvent = parseRepayAndWithdrawEvent(log)
        repayAndWithdrawEvent.timestamp = new Date(timestamp)
        repayAndWithdrawLogs.push(repayAndWithdrawEvent)
      } else if (log.topics[0] === ZAP_REPAY_TOPIC) {
        const zapRepayEvent = parseZapRepayEvent(log)
        zapRepayEvent.timestamp = new Date(timestamp)
        zapRepayLogs.push(zapRepayEvent)
      } else if (log.topics[0] === ZAP_REPAY_AND_WITHDRAW_TOPIC) {
        const zapRepayAndWithdrawEvent = parseZapRepayAndWithdrawEvent(log)
        zapRepayAndWithdrawEvent.timestamp = new Date(timestamp)
        zapRepayAndWithdrawLogs.push(zapRepayAndWithdrawEvent)
      } else if (log.topics[0] === WITHDRAW_TOPIC) {
        const withdrawEvent = parseWithdrawEvent(log)
        withdrawEvent.timestamp = new Date(timestamp)
        withdrawLogs.push(withdrawEvent)
      }
    }

    return { repayLogs, repayAndWithdrawLogs, zapRepayLogs, zapRepayAndWithdrawLogs, withdrawLogs }
  } catch (error) {
    console.error("Error fetching market repay logs:", error)
    throw error
  }
}
