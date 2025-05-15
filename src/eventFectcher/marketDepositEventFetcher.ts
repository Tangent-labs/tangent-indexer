import { JsonRpcProvider, AddressLike, ethers, Log } from "ethers"
import { getEthLogs } from "./_baseFectcher"

interface DepositEvent {
  depositer: AddressLike
  market: AddressLike
  stakedAmount: string
}

interface ZapDepositEvent {
  depositer: AddressLike
  market: AddressLike
  stakedAmount: string
  tokenIn: AddressLike
  amountIn: string
}

export interface DepositLog {
  account: string
  stakedAmount: string
  blockNumber: number
  contractAddress: string
}

const DEPOSIT_EVENT_SIGNATURES = {
  Deposit: ethers.id("Deposit(address,uint256)"),
  ZapDeposit: ethers.id("ZapDeposit(address,uint256,address,uint256)"),
}

export const fetchDepositLogs = async (
  provider: JsonRpcProvider,
  startingBlock: number,
  endingBlock: number,
  contracts: AddressLike[]
): Promise<DepositEvent[]> => {
  try {
    const logs = await getEthLogs(provider, startingBlock, endingBlock, contracts, [DEPOSIT_EVENT_SIGNATURES.Deposit])
    return logs.map((log) => parseDepositEvent(log))
  } catch (error) {
    console.error("Error fetching logs:", error)
    throw error
  }
}

const parseDepositEvent = (log: Log): DepositEvent => {
  const userDepositAddress = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1])?.at(0) as AddressLike

  const [stakedAmount] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], log.data)
  return {
    depositer: userDepositAddress,
    market: log.address,
    stakedAmount: stakedAmount.toString(),
  }
}

export const fetchZapDepositLogs = async (
  provider: JsonRpcProvider,
  startingBlock: number,
  endingBlock: number,
  contracts: AddressLike[]
): Promise<ZapDepositEvent[]> => {
  try {
    const logs = await getEthLogs(provider, startingBlock, endingBlock, contracts, [DEPOSIT_EVENT_SIGNATURES.ZapDeposit])
    return logs.map((log) => parseZapDepositEvent(log))
  } catch (error) {
    console.error("Error fetching ZapDeposit logs:", error)
    throw error
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
  }
}
