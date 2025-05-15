import { ethers, JsonRpcProvider, Log, AddressLike } from "ethers"
import { getEthLogs } from "./_baseFectcher"

interface DepositEvent {
  depositer: AddressLike
  market: string
  stakedAmount: string
}

interface ZapDepositEvent {
  depositer: AddressLike
  market: string
  stakedAmount: string
  tokenIn: string
  amountIn: string
}

const DEPOSIT_EVENT_SIGNATURES = {
  Deposit: ethers.id("Deposit(address,uint256)"),
  ZapDeposit: ethers.id("ZapDeposit(address,uint256,address,uint256)"),
}

const DEPOSIT_TOPIC = ethers.keccak256(ethers.toUtf8Bytes("Deposit(address,uint256)"))
const ZAP_DEPOSIT_TOPIC = ethers.keccak256(ethers.toUtf8Bytes("ZapDeposit(address,uint256,address,uint256)"))

const parseDepositEvent = (log: Log): DepositEvent => {
  const userDepositAddress = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1])?.at(0) as AddressLike

  const [stakedAmount] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], log.data)
  return {
    depositer: userDepositAddress,
    market: log.address,
    stakedAmount: stakedAmount.toString(),
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

export const fetchMarketDepositLogs = async (
  provider: JsonRpcProvider,
  startingBlock: number,
  endingBlock: number,
  contracts: AddressLike[]
): Promise<{ depositLogs: DepositEvent[]; zapDepositLogs: ZapDepositEvent[] }> => {
  try {
    const logs = await getEthLogs(provider, startingBlock, endingBlock, contracts, [DEPOSIT_EVENT_SIGNATURES.Deposit, DEPOSIT_EVENT_SIGNATURES.ZapDeposit])

    const depositLogs: DepositEvent[] = []
    const zapDepositLogs: ZapDepositEvent[] = []

    for (const log of logs) {
      console.log("LOG IS DEPOSIT : ", log.topics[0] === DEPOSIT_TOPIC)
      console.log("LOG IS ZAP_DEPOSIT : ", log.topics[0] === ZAP_DEPOSIT_TOPIC)

      if (log.topics[0] === DEPOSIT_TOPIC) {
        depositLogs.push(parseDepositEvent(log))
      } else if (log.topics[0] === ZAP_DEPOSIT_TOPIC) {
        zapDepositLogs.push(parseZapDepositEvent(log))
      }
    }

    return { depositLogs, zapDepositLogs }
  } catch (error) {
    console.error("Error fetching market deposit logs:", error)
    throw error
  }
}
