import { AddressLike, ethers, JsonRpcProvider, Log } from "ethers"
import { getEthLogs } from "./_baseFectcher"

// Define Event Signatures
/*
    Solidity ref

    event DepositAndBorrow(address indexed account, uint256 depositedAmount, uint256 stakedAmount, uint256 borrowedAmount, bool isZapping);
    event Borrow(address indexed account, address receiver, uint256 amount);
 */
const BORROW_EVENT_SIGNATURES = {
  DepositAndBorrow: ethers.id("DepositAndBorrow(address,uint256,uint256,uint256,bool)"),
  Borrow: ethers.id("Borrow(address,address,uint256)"),
}

// Type Definitions
interface BorrowEvent {
  borrower: AddressLike
  market: AddressLike
}

export const fetchBorrowLogs = async (
  provider: JsonRpcProvider,
  startingBlock: number,
  endingBlock: number,
  contracts: AddressLike[]
): Promise<BorrowEvent[]> => {
  try {
    const logs = await getEthLogs(provider, startingBlock, endingBlock, contracts, Object.values(BORROW_EVENT_SIGNATURES))
    return logs.map((log) => parseBorrowEvent(log))
  } catch (error) {
    console.error("Error fetching logs:", error)
    throw error
  }
}

// **Parsing Function**
const parseBorrowEvent = (log: Log): BorrowEvent => {
  // the account for the two events are the first indexed  params , so they are both store under topics[1]
  const borrowerAddress = ethers.AbiCoder.defaultAbiCoder().decode(["address"], log.topics[1])?.at(0) as AddressLike
  return {
    market: log.address,
    borrower: borrowerAddress,
  }
}
