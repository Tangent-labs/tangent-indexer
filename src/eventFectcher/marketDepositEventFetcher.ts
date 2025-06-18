import { ethers, JsonRpcProvider, Log, AddressLike } from "ethers"
import { getEthLogs } from "./_baseFectcher"

interface DepositEvent {
  market: AddressLike
  account: AddressLike
  stakedAmount: string
  timestamp: Date
  blockId: number
  txHash: string
}

interface BorrowEvent {
  market: AddressLike
  account: AddressLike
  receiver: AddressLike
  borrowedAmount: string
  timestamp: Date
  blockId: number
  txHash: string
}

interface DepositAndBorrowEvent {
  market: AddressLike
  account: AddressLike
  stakedAmount: string
  borrowAmount: string
  timestamp: Date
  blockId: number
  txHash: string
}

interface ZapDepositEvent {
  market: AddressLike
  account: AddressLike
  stakedAmount: string
  tokenIn: string
  amountIn: string
  timestamp: Date
  blockId: number
  txHash: string
}

interface ZapDepositAndBorrowEvent {
  market: AddressLike
  account: AddressLike
  stakedAmount: string
  borrowAmount: string
  tokenIn: string
  amountIn: string
  timestamp: Date
  blockId: number
  txHash: string
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
  const [receiver, borrowedAmount] = ethers.AbiCoder.defaultAbiCoder().decode(["address", "uint256"], log.data)

  return {
    market: log.address,
    account: userAddress,
    receiver: receiver,
    borrowedAmount: borrowedAmount.toString(),
    timestamp: new Date(), // placeholder
    blockId: 22531382, // placeholder
    txHash: log.transactionHash,
  }
}

const parseDepositEvent = (log: Log): DepositEvent => {
  const userDepositAddress = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1])?.at(0) as AddressLike
  const [stakedAmount] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], log.data)
  return {
    market: log.address,
    account: userDepositAddress,
    stakedAmount: stakedAmount.toString(),
    timestamp: new Date(), // placeholder
    blockId: 22531382, // placeholder
    txHash: log.transactionHash,
  }
}

const parseDepositAndBorrowEvent = (log: Log): DepositAndBorrowEvent => {
  const userDepositAddress = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1])?.at(0) as AddressLike
  const [stakedAmount, borrowAmount] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "uint256"], log.data)
  return {
    market: log.address,
    account: userDepositAddress,
    stakedAmount: stakedAmount.toString(),
    borrowAmount: borrowAmount.toString(),
    timestamp: new Date(), // placeholder
    blockId: 22531382, // placeholder
    txHash: log.transactionHash,
  }
}

const parseZapDepositEvent = (log: Log): ZapDepositEvent => {
  const userDepositAddress = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1])?.at(0) as AddressLike
  const [stakedAmount, tokenIn, amountIn] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "address", "uint256"], log.data)
  return {
    market: log.address,
    account: userDepositAddress,
    stakedAmount: stakedAmount.toString(),
    tokenIn,
    amountIn: amountIn.toString(),
    timestamp: new Date(), // placeholder
    blockId: 22531382, // placeholder
    txHash: log.transactionHash,
  }
}

const parseZapDepositAndBorrowEvent = (log: Log): ZapDepositAndBorrowEvent => {
  const userDepositAddress = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1])?.at(0) as AddressLike
  const [stakedAmount, borrowAmount, tokenIn, amountIn] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "address", "uint256"], log.data)
  return {
    market: log.address,
    account: userDepositAddress,
    stakedAmount: stakedAmount.toString(),
    borrowAmount: borrowAmount.toString(),
    tokenIn,
    amountIn: amountIn.toString(),
    timestamp: new Date(), // placeholder
    blockId: 22531382, // placeholder
    txHash: log.transactionHash,
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
    const depositTopics = [
      DEPOSIT_EVENT_SIGNATURES.Deposit,
      DEPOSIT_EVENT_SIGNATURES.Borrow,
      DEPOSIT_EVENT_SIGNATURES.ZapDeposit,
      DEPOSIT_EVENT_SIGNATURES.DepositAndBorrow,
      DEPOSIT_EVENT_SIGNATURES.ZapDepositAndBorrow,
    ]
    const logs = await getEthLogs(provider, startingBlock, endingBlock, contracts, depositTopics)

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

    const depositLogs: DepositEvent[] = []
    const borrowLogs: BorrowEvent[] = []
    const zapDepositLogs: ZapDepositEvent[] = []
    const depositAndBorrowLogs: DepositAndBorrowEvent[] = []
    const zapDepositAndBorrowLogs: ZapDepositAndBorrowEvent[] = []
    console.log(logs)
    for (const log of logs) {
      const timestamp = blockTimestamps.get(log.blockNumber)
      const blockNumber = blockNumbers.get(log.blockNumber)

      if (log.topics[0] === DEPOSIT_TOPIC) {
        const depositEvent = parseDepositEvent(log)
        depositEvent.timestamp = new Date(timestamp!)
        depositEvent.blockId = blockNumber!
        depositLogs.push(depositEvent)
      } else if (log.topics[0] === ZAP_DEPOSIT_TOPIC) {
        const zapDepositEvent = parseZapDepositEvent(log)
        zapDepositEvent.timestamp = new Date(timestamp!)
        zapDepositEvent.blockId = blockNumber!
        zapDepositLogs.push(zapDepositEvent)
      } else if (log.topics[0] === DEPOSIT_AND_BORROW_TOPIC) {
        const depositAndBorrowEvent = parseDepositAndBorrowEvent(log)
        depositAndBorrowEvent.timestamp = new Date(timestamp!)
        depositAndBorrowEvent.blockId = blockNumber!
        depositAndBorrowLogs.push(depositAndBorrowEvent)
      } else if (log.topics[0] === ZAP_DEPOSIT_AND_BORROW_TOPIC) {
        const zapDepositAndBorrowEvent = parseZapDepositAndBorrowEvent(log)
        zapDepositAndBorrowEvent.timestamp = new Date(timestamp!)
        zapDepositAndBorrowEvent.blockId = blockNumber!
        zapDepositAndBorrowLogs.push(zapDepositAndBorrowEvent)
      } else if (log.topics[0] === BORROW_TOPIC) {
        const borrowEvent = parseBorrowEvent(log)
        borrowEvent.timestamp = new Date(timestamp!)
        borrowEvent.blockId = blockNumber!
        borrowLogs.push(borrowEvent)
      }
    }

    return { depositLogs, zapDepositLogs, depositAndBorrowLogs, zapDepositAndBorrowLogs, borrowLogs }
  } catch (error) {
    console.error("Error fetching market deposit logs:", error)
    throw error
  }
}
