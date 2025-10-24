import { AbiCoder, AddressLike, ethers, JsonRpcProvider, Log } from "ethers"
import { getEthLogs } from "./_baseFetcher.js"

// Define Event Signatures

const SAVING_ACCOUNT_TOPICS = {
  process_report: ethers.id("StrategyReported(address,uint256,uint256,uint256,uint256,uint256,uint256)"),
}

export type ProcessReportEvent = {
  block_id: number
  tx_hash: string
  token: AddressLike
  gain: bigint
  loss: bigint
  currentDebtAfter: bigint
  protocolFees: bigint
  totalFees: bigint
  totalRefunds: bigint
}

export const getSavingAccountLogs = async (
  provider: JsonRpcProvider,
  startingBlock: number,
  endingBlock: number,
  contracts: AddressLike[]
): Promise<ProcessReportEvent[]> => {
  const logs = await fetchSavingAccountsLogs(provider, startingBlock, endingBlock, contracts)
  return logs.map(parseSavingAccountEvent)
}

// Type Definition for Market Events
const fetchSavingAccountsLogs = async (provider: JsonRpcProvider, startingBlock: number, endingBlock: number, contracts: AddressLike[]): Promise<Log[]> => {
  return await getEthLogs(provider, startingBlock, endingBlock, contracts, Object.values(SAVING_ACCOUNT_TOPICS))
}

const parseSavingAccountEvent = (log: Log) => {
  // uint256 gain, uint256 loss, uint256 currentDebtAfter, uint256 protocolFees, uint256 totalFees, uint256 totalRefunds
  const resultTypes = ["uint256", "uint256", "uint256", "uint256", "uint256", "uint256"]
  const [gain, loss, currentDebtAfter, protocolFees, totalFees, totalRefunds] = AbiCoder.defaultAbiCoder().decode(resultTypes, log.data)
  return {
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
    token: log.address,
    gain: gain as bigint,
    loss: loss as bigint,
    currentDebtAfter: currentDebtAfter as bigint,
    protocolFees: protocolFees as bigint,
    totalFees: totalFees as bigint,
    totalRefunds: totalRefunds as bigint,
  } as ProcessReportEvent
}
