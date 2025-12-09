import { Log, AbiCoder, ZeroAddress } from "ethers"
import { Prisma } from "@prisma/client"

function userAddress(topic: string): string {
  return AbiCoder.defaultAbiCoder().decode(["address"], topic)[0].toLowerCase()
}

export function parseTransferEvent(log: Log): Prisma.transfer_eventsUncheckedCreateInput {
  const [amount] = AbiCoder.defaultAbiCoder().decode(["uint256"], log.data)

  const from = userAddress(log.topics[1])
  const to = userAddress(log.topics[2])

  return {
    token_address: log.address.toLowerCase(),
    from,
    to,
    amount: amount.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseStakeConvexEvent(log: Log): Prisma.transfer_eventsUncheckedCreateInput {
  const [amount] = AbiCoder.defaultAbiCoder().decode(["uint256"], log.data)

  const from = ZeroAddress.toLowerCase()
  const to = userAddress(log.topics[1])

  return {
    token_address: log.address.toLowerCase(),
    from,
    to,
    amount: amount.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseWithdrawConvexEvent(log: Log): Prisma.transfer_eventsUncheckedCreateInput {
  const [amount] = AbiCoder.defaultAbiCoder().decode(["uint256"], log.data)

  const from = userAddress(log.topics[1])
  const to = ZeroAddress.toLowerCase()

  return {
    token_address: log.address.toLowerCase(),
    from,
    to,
    amount: amount.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseBorrowEvent(log: Log, mapMarketIdPerAddress: Map<string, number>): Prisma.borrowCreateManyInput {
  const [receiver, borrowedAmount, debtShares] = AbiCoder.defaultAbiCoder().decode(["address", "uint256", "uint256"], log.data)

  return {
    market_id: mapMarketIdPerAddress.get(log.address.toLowerCase())!,
    account: userAddress(log.topics[1]),
    receiver,
    borrowed_amount: borrowedAmount.toString(),
    debt_shares: debtShares.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseAddLiquidity(log: Log, lpId: bigint, lpAmount: string): Prisma.add_liquidity_eventsCreateManyInput {
  const [tokenAmounts, , ,] = AbiCoder.defaultAbiCoder().decode(["uint256[2],uint256[2],uint256,uint256"], log.data)

  const provider = userAddress(log.topics[1])

  return {
    usg_lp_id: lpId,
    provider: provider.toLowerCase(),
    lp_amount: lpAmount,
    token0_amount: tokenAmounts[0].toString(),
    token1_amount: tokenAmounts[1].toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseDepositEvent(log: Log, mapMarketIdPerAddress: Map<string, number>): Prisma.depositCreateManyInput {
  const [stakedAmount] = AbiCoder.defaultAbiCoder().decode(["uint256"], log.data)

  return {
    market_id: mapMarketIdPerAddress.get(log.address.toLowerCase())!,
    account: userAddress(log.topics[1]),
    staked_amount: stakedAmount.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseDepositAndBorrowEvent(log: Log, mapMarketIdPerAddress: Map<string, number>): Prisma.deposit_and_borrowCreateManyInput {
  const [stakedAmount, borrowAmount, debtShares] = AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "uint256"], log.data)

  return {
    market_id: mapMarketIdPerAddress.get(log.address.toLowerCase())!,
    account: userAddress(log.topics[1]),
    staked_amount: stakedAmount.toString(),
    borrow_amount: borrowAmount.toString(),
    debt_shares: debtShares.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseZapDepositEvent(log: Log, mapMarketIdPerAddress: Map<string, number>): Prisma.zap_depositCreateManyInput {
  const [stakedAmount, tokenIn, amountIn] = AbiCoder.defaultAbiCoder().decode(["uint256", "address", "uint256"], log.data)
  return {
    market_id: mapMarketIdPerAddress.get(log.address.toLowerCase())!,
    account: userAddress(log.topics[1]),
    staked_amount: stakedAmount.toString(),
    token_in: tokenIn,
    amount_in: amountIn.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseZapDepositAndBorrowEvent(log: Log, mapMarketIdPerAddress: Map<string, number>): Prisma.zap_deposit_and_borrowCreateManyInput {
  const [stakedAmount, borrowAmount, debtShares, tokenIn, amountIn] = AbiCoder.defaultAbiCoder().decode(
    ["uint256", "uint256", "uint256", "address", "uint256"],
    log.data
  )

  return {
    market_id: mapMarketIdPerAddress.get(log.address.toLowerCase())!,
    account: userAddress(log.topics[1]),
    staked_amount: stakedAmount.toString(),
    borrow_amount: borrowAmount.toString(),
    debt_shares: debtShares.toString(),
    token_in: tokenIn,
    amount_in: amountIn.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}
export function parseWithdrawEvent(log: Log, mapMarketIdPerAddress: Map<string, number>): Prisma.withdrawCreateManyInput {
  const [withdrawnAmount] = AbiCoder.defaultAbiCoder().decode(["uint256"], log.data)
  return {
    market_id: mapMarketIdPerAddress.get(log.address.toLowerCase())!,
    account: userAddress(log.topics[1]),
    withdrawn_amount: withdrawnAmount.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseRepayEvent(log: Log, mapMarketIdPerAddress: Map<string, number>): Prisma.repayCreateManyInput {
  const [repayer, repaidAmount, debtShares] = AbiCoder.defaultAbiCoder().decode(["address", "uint256", "uint256"], log.data)
  return {
    market_id: mapMarketIdPerAddress.get(log.address.toLowerCase())!,
    account: userAddress(log.topics[1]),
    repayer: repayer.toLowerCase(),
    repaid_amount: repaidAmount.toString(),
    debt_shares: debtShares.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseRepayAndWithdrawEvent(log: Log, mapMarketIdPerAddress: Map<string, number>): Prisma.repay_and_withdrawCreateManyInput {
  const [repaidAmount, withdrawnAmount, debtShares] = AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "uint256"], log.data)
  return {
    market_id: mapMarketIdPerAddress.get(log.address.toLowerCase())!,
    account: userAddress(log.topics[1]),
    repaid_amount: repaidAmount.toString(),
    withdrawn_amount: withdrawnAmount.toString(),
    debt_shares: debtShares.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseZapRepayEvent(log: Log, mapMarketIdPerAddress: Map<string, number>): Prisma.zap_repayCreateManyInput {
  const [repayer, repaidAmount, debtShares, tokenIn, amountIn] = AbiCoder.defaultAbiCoder().decode(
    ["address", "uint256", "uint256", "address", "uint256"],
    log.data
  )
  return {
    market_id: mapMarketIdPerAddress.get(log.address.toLowerCase())!,
    account: userAddress(log.topics[1]),
    repayer: repayer.toLowerCase(),
    repaid_amount: repaidAmount.toString(),
    debt_shares: debtShares.toString(),
    token_in: tokenIn,
    amount_in: amountIn.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseZapRepayAndWithdrawEvent(log: Log, mapMarketIdPerAddress: Map<string, number>): Prisma.zap_repay_and_withdrawCreateManyInput {
  const [withdrawnAmount, repaidAmount, debtShares, tokenIn, amountIn] = AbiCoder.defaultAbiCoder().decode(
    ["uint256", "uint256", "uint256", "address", "uint256"],
    log.data
  )
  return {
    market_id: mapMarketIdPerAddress.get(log.address.toLowerCase())!,
    account: userAddress(log.topics[1]),
    withdrawn_amount: withdrawnAmount.toString(),
    repaid_amount: repaidAmount.toString(),
    debt_shares: debtShares.toString(),
    token_in: tokenIn,
    amount_in: amountIn.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseLeverageEvent(log: Log, mapMarketIdPerAddress: Map<string, number>): Prisma.leverageCreateManyInput {
  const [stakedAmount, collatBought, borrowedAmount, debtShares] = AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "uint256", "uint256"], log.data)
  return {
    market_id: mapMarketIdPerAddress.get(log.address.toLowerCase())!,
    account: userAddress(log.topics[1]),
    staked_amount: stakedAmount.toString(),
    collat_bought: collatBought.toString(),
    borrowed_amount: borrowedAmount.toString(),
    debt_shares: debtShares.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseZapLeverageEvent(log: Log, mapMarketIdPerAddress: Map<string, number>): Prisma.zap_leverageCreateManyInput {
  const [stakedAmount, collatZapDeposit, collatLeverage, borrowedAmount, debtShares, tokenIn, amountIn] = AbiCoder.defaultAbiCoder().decode(
    ["uint256", "uint256", "uint256", "uint256", "uint256", "address", "uint256"],
    log.data
  )
  return {
    market_id: mapMarketIdPerAddress.get(log.address.toLowerCase())!,
    account: userAddress(log.topics[1]),
    staked_amount: stakedAmount.toString(),
    collat_zap_deposit: collatZapDeposit.toString(),
    collat_leverage: collatLeverage.toString(),
    borrowed_amount: borrowedAmount.toString(),
    debt_shares: debtShares.toString(),
    token_in: tokenIn.toString(),
    amount_in: amountIn.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseLiquidateEvent(log: Log, mapMarketIdPerAddress: Map<string, number>): Prisma.liquidateCreateManyInput {
  const [repaidAmount, debtShares, fee, collateralLiquidated, liquidator] = AbiCoder.defaultAbiCoder().decode(
    ["uint256", "uint256", "uint256", "uint256", "address"],
    log.data
  )
  return {
    market_id: mapMarketIdPerAddress.get(log.address.toLowerCase())!,
    account: userAddress(log.topics[1]),
    repaid_amount: repaidAmount.toString(),
    fee: fee.toString(),
    collateral_liquidated: collateralLiquidated.toString(),
    liquidator: liquidator.toLowerCase(),
    debt_shares: debtShares.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseSelfLiquidateEvent(log: Log, mapMarketIdPerAddress: Map<string, number>): Prisma.self_liquidateCreateManyInput {
  const [repaidAmount, debtShares, collateralLiquidated, liquidator] = AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "uint256", "address"], log.data)
  return {
    market_id: mapMarketIdPerAddress.get(log.address.toLowerCase())!,
    account: userAddress(log.topics[1]),
    repaid_amount: repaidAmount.toString(),
    collateral_liquidated: collateralLiquidated.toString(),
    liquidator: liquidator.toLowerCase(),
    debt_shares: debtShares.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseSeizeCollateralEvent(log: Log, mapMarketIdPerAddress: Map<string, number>): Prisma.seize_collateralCreateManyInput {
  const [badDebt, collateralSeized] = AbiCoder.defaultAbiCoder().decode(["uint256", "uint256"], log.data)
  return {
    market_id: mapMarketIdPerAddress.get(log.address.toLowerCase())!,
    account: userAddress(log.topics[1]),
    bad_debt: badDebt.toString(),
    collateral_seized: collateralSeized.toString(),
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseMigrateFromEvent(log: Log, mapMarketIdPerAddress: Map<string, number>): Prisma.migrate_fromCreateManyInput {
  const [collatWithdrawn, debtRemoved, debtRepaid, debtShares] = AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "uint256", "uint256"], log.data)
  return {
    market_id: mapMarketIdPerAddress.get(log.address.toLowerCase())!,
    account: userAddress(log.topics[1]),
    collat_withdrawn: collatWithdrawn,
    debt_removed: debtRemoved,
    debt_repaid: debtRepaid,
    debt_shares: debtShares,
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}

export function parseMigrateToEvent(log: Log, mapMarketIdPerAddress: Map<string, number>): Prisma.migrate_toCreateManyInput {
  const [collatAdded, debtAdded, debtShares] = AbiCoder.defaultAbiCoder().decode(["uint256", "uint256", "uint256"], log.data)
  return {
    market_id: mapMarketIdPerAddress.get(log.address.toLowerCase())!,
    account: userAddress(log.topics[1]),
    collat_added: collatAdded,
    debt_added: debtAdded,
    debt_shares: debtShares,
    block_date: new Date(), // placeholder
    block_id: Number(log.blockNumber),
    tx_hash: log.transactionHash,
  }
}
