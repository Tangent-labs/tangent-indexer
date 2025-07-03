import { Log, AbiCoder } from "ethers"
import { Prisma } from "@prisma/client"

function userAddress(topic: string): string {
  return AbiCoder.defaultAbiCoder().decode(["address"], topic)[0]
}

export function parseBorrowEvent(log: Log): Prisma.market_borrowCreateInput {
  const [receiver, borrowedAmount] = AbiCoder.defaultAbiCoder().decode(["address", "uint256"], log.data)

  return {
    market: log.address,
    account: userAddress(log.topics[1]),
    receiver: receiver,
    borrowed_amount: borrowedAmount.toString(),
    block_date: new Date(), // placeholder
    block_id: log.blockNumber,
    tx_hash: log.transactionHash,
  }
}

export function parseDepositEvent(log: Log): Prisma.market_depositCreateInput {
  const [stakedAmount] = AbiCoder.defaultAbiCoder().decode(["uint256"], log.data)
  return {
    market: log.address,
    account: userAddress(log.topics[1]),
    staked_amount: stakedAmount.toString(),
    block_date: new Date(), // placeholder
    block_id: log.blockNumber,
    tx_hash: log.transactionHash,
  }
}

export function parseDepositAndBorrowEvent(log: Log): Prisma.market_deposit_and_borrowCreateInput {
  const [stakedAmount, borrowAmount] = AbiCoder.defaultAbiCoder().decode(["uint256", "uint256"], log.data)
  return {
    market: log.address,
    account: userAddress(log.topics[1]),
    staked_amount: stakedAmount.toString(),
    borrow_amount: borrowAmount.toString(),
    block_date: new Date(), // placeholder
    block_id: log.blockNumber,
    tx_hash: log.transactionHash,
  }
}

export function parseZapDepositEvent(log: Log): Prisma.market_zap_depositCreateInput {
  const [stakedAmount, tokenIn, amountIn] = AbiCoder.defaultAbiCoder().decode(["uint256", "address", "uint256"], log.data)
  return {
    market: log.address,
    account: userAddress(log.topics[1]),
    staked_amount: stakedAmount.toString(),
    token_in: tokenIn,
    amount_in: amountIn.toString(),
    block_date: new Date(), // placeholder
    block_id: log.blockNumber,
    tx_hash: log.transactionHash,
  }
}

export function parseZapDepositAndBorrowEvent(log: Log): Prisma.market_zap_deposit_and_borrowCreateInput {
  const [stakedAmount, borrowAmount, tokenIn, amountIn] = AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "address", "uint256"], log.data)
  return {
    market: log.address,
    account: userAddress(log.topics[1]),
    staked_amount: stakedAmount.toString(),
    borrow_amount: borrowAmount.toString(),
    token_in: tokenIn,
    amount_in: amountIn.toString(),
    block_date: new Date(), // placeholder
    block_id: log.blockNumber,
    tx_hash: log.transactionHash,
  }
}
export function parseWithdrawEvent(log: Log): Prisma.market_withdrawCreateInput {
  const [withdrawnAmount] = AbiCoder.defaultAbiCoder().decode(["uint256"], log.data)
  return {
    market: log.address,
    account: userAddress(log.topics[1]),
    withdrawn_amount: withdrawnAmount.toString(),
    block_date: new Date(), // placeholder
    block_id: log.blockNumber,
    tx_hash: log.transactionHash,
  }
}

export function parseRepayEvent(log: Log): Prisma.market_repayCreateInput {
  const [repayer, repaidAmount, is_repay_all] = AbiCoder.defaultAbiCoder().decode(["address", "uint256", "bool"], log.data)
  return {
    market: log.address,
    account: userAddress(log.topics[1]),
    repayer,
    repaid_amount: repaidAmount.toString(),
    is_repay_all,
    block_date: new Date(), // placeholder
    block_id: log.blockNumber,
    tx_hash: log.transactionHash,
  }
}

export function parseRepayAndWithdrawEvent(log: Log): Prisma.market_repay_and_withdrawCreateInput {
  const [repaidAmount, withdrawnAmount, isRepayAll] = AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "bool"], log.data)
  return {
    market: log.address,
    account: userAddress(log.topics[1]),
    repaid_amount: repaidAmount.toString(),
    withdrawn_amount: withdrawnAmount.toString(),
    is_repay_all: isRepayAll,
    block_date: new Date(), // placeholder
    block_id: log.blockNumber,
    tx_hash: log.transactionHash,
  }
}

export function parseZapRepayEvent(log: Log): Prisma.market_zap_repayCreateInput {
  const [repayer, repaidAmount, isRepayAll, tokenIn, amountIn] = AbiCoder.defaultAbiCoder().decode(
    ["address", "uint256", "bool", "address", "uint256"],
    log.data
  )
  return {
    market: log.address,
    account: userAddress(log.topics[1]),
    repayer,
    repaid_amount: repaidAmount.toString(),
    is_repay_all: isRepayAll,
    token_in: tokenIn,
    amount_in: amountIn.toString(),
    block_date: new Date(), // placeholder
    block_id: log.blockNumber,
    tx_hash: log.transactionHash,
  }
}

export function parseZapRepayAndWithdrawEvent(log: Log): Prisma.market_zap_repay_and_withdrawCreateInput {
  const [withdrawnAmount, repaidAmount, isRepayAll, tokenIn, amountIn] = AbiCoder.defaultAbiCoder().decode(
    ["uint256", "uint256", "bool", "address", "uint256"],
    log.data
  )
  return {
    market: log.address,
    account: userAddress(log.topics[1]),
    withdrawn_amount: withdrawnAmount.toString(),
    repaid_amount: repaidAmount.toString(),
    is_repay_all: isRepayAll,
    token_in: tokenIn,
    amount_in: amountIn.toString(),
    block_date: new Date(), // placeholder
    block_id: log.blockNumber,
    tx_hash: log.transactionHash,
  }
}

export function parseLeverageEvent(log: Log): Prisma.market_leverageCreateInput {
  const [stakedAmount, collatBought, borrowedAmount] = AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "uint256"], log.data)
  return {
    market: log.address,
    account: userAddress(log.topics[1]),
    staked_amount: stakedAmount.toString(),
    collat_bought: collatBought.toString(),
    borrowed_amount: borrowedAmount.toString(),
    block_date: new Date(), // placeholder
    block_id: log.blockNumber,
    tx_hash: log.transactionHash,
  }
}

export function parseZapLeverageEvent(log: Log): Prisma.market_zap_leverageCreateInput {
  const [stakedAmount, collatZapDeposit, collatLeverage, borrowedAmount, tokenIn, amountIn] = AbiCoder.defaultAbiCoder().decode(
    ["uint256", "uint256", "uint256", "uint256", "address", "uint256"],
    log.data
  )
  return {
    market: log.address,
    account: userAddress(log.topics[1]),
    staked_amount: stakedAmount.toString(),
    collat_zap_deposit: collatZapDeposit.toString(),
    collat_leverage: collatLeverage.toString(),
    borrowed_amount: borrowedAmount.toString(),
    token_in: tokenIn.toString(),
    amount_in: amountIn.toString(),
    block_date: new Date(), // placeholder
    block_id: log.blockNumber,
    tx_hash: log.transactionHash,
  }
}
