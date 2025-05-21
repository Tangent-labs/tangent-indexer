import { ethers, JsonRpcProvider, Log, AddressLike } from "ethers"
import { getEthLogs } from "./_baseFectcher"

interface DepositEvent {
  depositer: AddressLike
  market: string
  stakedAmount: string
  timestamp: Date
}

interface BorrowEvent {
  account: AddressLike
  receiver: AddressLike
  borrowedAmount: string
  timestamp: Date
}

interface DepositAndBorrowEvent {
  depositer: AddressLike
  market: string
  stakedAmount: string
  borrowAmount: string
  timestamp: Date
}

interface ZapDepositEvent {
  depositer: AddressLike
  market: string
  stakedAmount: string
  tokenIn: string
  amountIn: string
  timestamp: Date
}

interface ZapDepositAndBorrowEvent {
  depositer: AddressLike
  market: string
  stakedAmount: string
  borrowAmount: string
  tokenIn: string
  amountIn: string
  timestamp: Date
}

const DEPOSIT_EVENT_SIGNATURES = {
  Deposit: ethers.id("Deposit(address,uint256)"),
  Borrow: ethers.id("Borrow(address,address,uint256)"),
  ZapDeposit: ethers.id("ZapDeposit(address,uint256,address,uint256)"),
  DepositAndBorrow: ethers.id("DepositAndBorrow(address,uint256,uint256)"),
  ZapDepositAndBorrow: ethers.id("ZapDepositAndBorrow(address,uint256,uint256,address,uint256)"),
}

const DEPOSIT_TOPIC = ethers.keccak256(ethers.toUtf8Bytes("Deposit(address,uint256)"))
const BORROW_TOPIC = ethers.keccak256(ethers.toUtf8Bytes("Borrow(address,address,uint256)"))
const ZAP_DEPOSIT_TOPIC = ethers.keccak256(ethers.toUtf8Bytes("ZapDeposit(address,uint256,address,uint256)"))
const DEPOSIT_AND_BORROW_TOPIC = ethers.keccak256(ethers.toUtf8Bytes("DepositAndBorrow(address,uint256,uint256)"))
const ZAP_DEPOSIT_AND_BORROW_TOPIC = ethers.keccak256(ethers.toUtf8Bytes("ZapDepositAndBorrow(address,uint256,uint256,address,uint256)"))

const parseBorrowEvent = (log: Log): BorrowEvent => {
  const userAddress = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1])?.at(0) as AddressLike
  const [borrowedAmount] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], log.data)
  return {
    account: userAddress,
    receiver: userAddress,
    borrowedAmount: borrowedAmount.toString(),
    timestamp: new Date(), // placeholder
  }
}

const parseDepositEvent = (log: Log): DepositEvent => {
  const userDepositAddress = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1])?.at(0) as AddressLike
  const [stakedAmount] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], log.data)
  return {
    depositer: userDepositAddress,
    market: log.address,
    stakedAmount: stakedAmount.toString(),
    timestamp: new Date(), // placeholder
  }
}

const parseDepositAndBorrowEvent = (log: Log): DepositAndBorrowEvent => {
  const userDepositAddress = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1])?.at(0) as AddressLike
  const [stakedAmount, borrowAmount] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "uint256"], log.data)
  return {
    depositer: userDepositAddress,
    market: log.address,
    stakedAmount: stakedAmount.toString(),
    borrowAmount: borrowAmount.toString(),
    timestamp: new Date(), // placeholder
  }
}

const parseZapDepositEvent = (log: Log): ZapDepositEvent => {
  const userDepositAddress = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1])?.at(0) as AddressLike
  const [stakedAmount, tokenIn, amountIn] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "address", "uint256"], log.data)
  return {
    depositer: userDepositAddress,
    market: log.address,
    stakedAmount: stakedAmount.toString(),
    tokenIn,
    amountIn: amountIn.toString(),
    timestamp: new Date(), // placeholder
  }
}

const parseZapDepositAndBorrowEvent = (log: Log): ZapDepositAndBorrowEvent => {
  const userDepositAddress = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1])?.at(0) as AddressLike
  const [stakedAmount, borrowAmount, tokenIn, amountIn] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "address", "uint256"], log.data)
  return {
    depositer: userDepositAddress,
    market: log.address,
    stakedAmount: stakedAmount.toString(),
    borrowAmount: borrowAmount.toString(),
    tokenIn,
    amountIn: amountIn.toString(),
    timestamp: new Date(), // placeholder
  }
}

export const fetchMarketDepositLogs = async (
  provider: JsonRpcProvider,
  startingBlock: number,
  endingBlock: number,
  contracts: AddressLike[]
): Promise<{
  depositLogs: DepositEvent[]
  borrowLogs: BorrowEvent[]
  zapDepositLogs: ZapDepositEvent[]
  depositAndBorrowLogs: DepositAndBorrowEvent[]
  zapDepositAndBorrowLogs: ZapDepositAndBorrowEvent[]
}> => {
  try {
    const logs = await getEthLogs(provider, startingBlock, endingBlock, contracts, [
      DEPOSIT_EVENT_SIGNATURES.Deposit,
      DEPOSIT_EVENT_SIGNATURES.Borrow,
      DEPOSIT_EVENT_SIGNATURES.ZapDeposit,
      DEPOSIT_EVENT_SIGNATURES.DepositAndBorrow,
      DEPOSIT_EVENT_SIGNATURES.ZapDepositAndBorrow,
    ])

    const blockTimestamps = new Map<number, number>()
    const uniqueBlockNumbers = [...new Set(logs.map((log) => log.blockNumber))]
    for (const blockNumber of uniqueBlockNumbers) {
      const block = await provider.getBlock(blockNumber)
      if (block && block.timestamp) {
        blockTimestamps.set(blockNumber, block.timestamp * 1000)
      }
    }

    const depositLogs: DepositEvent[] = []
    const borrowLogs: BorrowEvent[] = []
    const zapDepositLogs: ZapDepositEvent[] = []
    const depositAndBorrowLogs: DepositAndBorrowEvent[] = []
    const zapDepositAndBorrowLogs: ZapDepositAndBorrowEvent[] = []

    for (const log of logs) {
      const timestamp = blockTimestamps.get(log.blockNumber) || Date.now()
      if (log.topics[0] === DEPOSIT_TOPIC) {
        const depositEvent = parseDepositEvent(log)
        depositEvent.timestamp = new Date(timestamp)
        depositLogs.push(depositEvent)
      } else if (log.topics[0] === ZAP_DEPOSIT_TOPIC) {
        const zapDepositEvent = parseZapDepositEvent(log)
        zapDepositEvent.timestamp = new Date(timestamp)
        zapDepositLogs.push(zapDepositEvent)
      } else if (log.topics[0] === DEPOSIT_AND_BORROW_TOPIC) {
        const depositAndBorrowEvent = parseDepositAndBorrowEvent(log)
        depositAndBorrowEvent.timestamp = new Date(timestamp)
        depositAndBorrowLogs.push(depositAndBorrowEvent)
      } else if (log.topics[0] === ZAP_DEPOSIT_AND_BORROW_TOPIC) {
        const zapDepositAndBorrowEvent = parseZapDepositAndBorrowEvent(log)
        zapDepositAndBorrowEvent.timestamp = new Date(timestamp)
        zapDepositAndBorrowLogs.push(zapDepositAndBorrowEvent)
      } else if (log.topics[0] === BORROW_TOPIC) {
        const borrowEvent = parseBorrowEvent(log)
        borrowEvent.timestamp = new Date(timestamp)
        borrowLogs.push(borrowEvent)
      }
    }

    return { depositLogs, zapDepositLogs, depositAndBorrowLogs, zapDepositAndBorrowLogs, borrowLogs }
  } catch (error) {
    console.error("Error fetching market deposit logs:", error)
    throw error
  }
}
