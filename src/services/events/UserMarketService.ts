import { AddressLike, Log } from "ethers"
import { Prisma } from "@prisma/client"

import { EVENT_TOPICS } from "../../resources/eventSignatures.js"
import {
  parseBorrowEvent,
  parseDepositAndBorrowEvent,
  parseDepositEvent,
  parseLeverageEvent,
  parseLiquidateEvent,
  parseMigrateFromEvent,
  parseMigrateToEvent,
  parseRepayAndWithdrawEvent,
  parseRepayEvent,
  parseSeizeCollateralEvent,
  parseSelfLiquidateEvent,
  parseWithdrawEvent,
  parseZapDepositAndBorrowEvent,
  parseZapDepositEvent,
  parseZapLeverageEvent,
  parseZapRepayAndWithdrawEvent,
  parseZapRepayEvent,
} from "../../eventFectcher/marketUserEvents.parsers.js"
import { UserEventsRepository } from "../../db/UserEventsRepository.js"

export type UserAction = {
  user: AddressLike
  marketId: number
  blockId: number
  debt_shares: bigint
  timestamp?: Date
}

export type SortedEvents = {
  Deposit: Prisma.depositCreateManyInput[]
  ZapDeposit: Prisma.zap_depositCreateManyInput[]
  DepositAndBorrow: Prisma.deposit_and_borrowCreateManyInput[]
  ZapDepositAndBorrow: Prisma.zap_deposit_and_borrowCreateManyInput[]
  Repay: Prisma.repayCreateManyInput[]
  ZapRepay: Prisma.zap_repayCreateManyInput[]
  RepayAndWithdraw: Prisma.repay_and_withdrawCreateManyInput[]
  ZapRepayAndWithdraw: Prisma.zap_repay_and_withdrawCreateManyInput[]
  Withdraw: Prisma.withdrawCreateManyInput[]
  Borrow: Prisma.borrowCreateManyInput[]
  Leverage: Prisma.leverageCreateManyInput[]
  ZapLeverage: Prisma.zap_leverageCreateManyInput[]
  Liquidate: Prisma.liquidateCreateManyInput[]
  SelfLiquidate: Prisma.self_liquidateCreateManyInput[]
  SeizeCollateral: Prisma.seize_collateralCreateManyInput[]
  MigrateFrom: Prisma.migrate_fromCreateManyInput[]
  MigrateTo: Prisma.migrate_toCreateManyInput[]
}

export type DebtSharesCheckpoint = { market: string; user: string; amount: bigint; isRepay: boolean; blockId: number; txHash: string }

export type DebtSharesCheckpointStruct = {
  [marketAddress: string]: {
    [user: string]: DebtSharesCheckpoint[]
  }
}
export class UserMarketService {
  userEventsRepository: UserEventsRepository
  constructor(userEventsRepository: UserEventsRepository) {
    this.userEventsRepository = userEventsRepository
  }

  async insertEvents(sortedParsedEvents: SortedEvents) {
    await this.userEventsRepository.insertDeposits(sortedParsedEvents.Deposit)
    await this.userEventsRepository.insertZapDeposits(sortedParsedEvents.ZapDeposit)
    await this.userEventsRepository.insertDepositAndBorrows(sortedParsedEvents.DepositAndBorrow)
    await this.userEventsRepository.insertZapDepositAndBorrows(sortedParsedEvents.ZapDepositAndBorrow)
    await this.userEventsRepository.insertBorrows(sortedParsedEvents.Borrow)

    await this.userEventsRepository.insertWithdraws(sortedParsedEvents.Withdraw)
    await this.userEventsRepository.insertRepays(sortedParsedEvents.Repay)
    await this.userEventsRepository.insertZapRepays(sortedParsedEvents.ZapRepay)
    await this.userEventsRepository.insertRepayAndWithdraws(sortedParsedEvents.RepayAndWithdraw)
    await this.userEventsRepository.insertZapRepayAndWithdraws(sortedParsedEvents.ZapRepayAndWithdraw)

    await this.userEventsRepository.insertLeverages(sortedParsedEvents.Leverage)
    await this.userEventsRepository.insertZapLeverages(sortedParsedEvents.ZapLeverage)

    await this.userEventsRepository.insertLiquidations(sortedParsedEvents.Liquidate)
    await this.userEventsRepository.insertSelfLiquidations(sortedParsedEvents.SelfLiquidate)
    await this.userEventsRepository.insertSeizeCollateral(sortedParsedEvents.SeizeCollateral)
    await this.userEventsRepository.insertSelfLiquidations(sortedParsedEvents.SelfLiquidate)
    await this.userEventsRepository.insertSeizeCollateral(sortedParsedEvents.SeizeCollateral)
  }

  replaceRightDates(sortedParsedEvents: SortedEvents, userActions: UserAction[], blockInfos: Map<number, number>) {
    Object.values(sortedParsedEvents).forEach((v) => {
      v.forEach((event) => {
        event.block_date = new Date(blockInfos.get(event.block_id)! * 1_000)
      })
    })

    userActions.forEach((userAction) => {
      userAction.timestamp = new Date(blockInfos.get(userAction.blockId)! * 1_000)
    })
    return { sortedParsedEvents, userActions }
  }

  pushOrCreate(debtCheckpoint: DebtSharesCheckpoint, debtSharesCheckpoints: DebtSharesCheckpointStruct) {
    const market = debtCheckpoint.market
    const user = debtCheckpoint.user
    if (debtSharesCheckpoints[market]) {
      if (debtSharesCheckpoints[market][user]) {
        debtSharesCheckpoints[market][user].push(debtCheckpoint)
      } else {
        debtSharesCheckpoints[market][user] = [debtCheckpoint]
      }
    } else {
      debtSharesCheckpoints[market] = {}
      debtSharesCheckpoints[market][user] = [debtCheckpoint]
    }
  }

  sortUserMarketLogs(logs: Log[], mapMarketIdPerAddresses: Map<string, number>) {
    const activeBorrowActions: UserAction[] = []
    const sortedAndParsedEvents: SortedEvents = {
      Borrow: [],
      Deposit: [],
      DepositAndBorrow: [],
      Leverage: [],
      Repay: [],
      RepayAndWithdraw: [],
      Withdraw: [],
      ZapDeposit: [],
      ZapDepositAndBorrow: [],
      ZapLeverage: [],
      ZapRepay: [],
      ZapRepayAndWithdraw: [],
      Liquidate: [],
      SelfLiquidate: [],
      SeizeCollateral: [],
      MigrateFrom: [],
      MigrateTo: [],
    }

    // Retrieve state of all active debts in lp_user_tasks

    const uniqueBlockId: Set<number> = new Set()
    const users: { user: string; marketId: number | bigint }[] = []
    const debtSharesCheckpoints: DebtSharesCheckpointStruct = {}

    logs.forEach((log) => {
      const eventTopic = log.topics[0]
      const eventType = EVENT_TOPICS[eventTopic]
      uniqueBlockId.add(log.blockNumber)
      const contractAddress = log.address.toLowerCase()

      switch (eventType) {
        case "Repay":
          {
            const repayEvent = parseRepayEvent(log, mapMarketIdPerAddresses)
            const debtShares = BigInt(repayEvent.debt_shares)
            activeBorrowActions.push({
              user: repayEvent.account,
              marketId: Number(repayEvent.market_id),
              debt_shares: BigInt(debtShares),
              blockId: repayEvent.block_id,
            })
            sortedAndParsedEvents.Repay.push(repayEvent)
            users.push({ user: repayEvent.account, marketId: repayEvent.market_id })
            this.pushOrCreate(
              {
                market: contractAddress,
                user: repayEvent.account,
                isRepay: true,
                amount: debtShares,
                blockId: repayEvent.block_id,
                txHash: repayEvent.tx_hash,
              },
              debtSharesCheckpoints
            )
          }
          break
        case "RepayAndWithdraw":
          {
            const repayAndWithdrawEvent = parseRepayAndWithdrawEvent(log, mapMarketIdPerAddresses)
            const debtShares = BigInt(repayAndWithdrawEvent.debt_shares)
            activeBorrowActions.push({
              user: repayAndWithdrawEvent.account,
              marketId: Number(repayAndWithdrawEvent.market_id),
              debt_shares: BigInt(repayAndWithdrawEvent.debt_shares),
              blockId: repayAndWithdrawEvent.block_id,
            })
            sortedAndParsedEvents.RepayAndWithdraw.push(repayAndWithdrawEvent)
            users.push({ user: repayAndWithdrawEvent.account, marketId: repayAndWithdrawEvent.market_id })
            this.pushOrCreate(
              {
                market: contractAddress,
                user: repayAndWithdrawEvent.account,
                isRepay: true,
                amount: debtShares,
                blockId: repayAndWithdrawEvent.block_id,
                txHash: repayAndWithdrawEvent.tx_hash,
              },
              debtSharesCheckpoints
            )
          }
          break
        case "ZapRepay":
          {
            const zapRepayEvent = parseZapRepayEvent(log, mapMarketIdPerAddresses)
            const debtShares = BigInt(zapRepayEvent.debt_shares)
            activeBorrowActions.push({
              user: zapRepayEvent.account,
              marketId: Number(zapRepayEvent.market_id),
              debt_shares: BigInt(zapRepayEvent.debt_shares),
              blockId: zapRepayEvent.block_id,
            })
            sortedAndParsedEvents.ZapRepay.push(zapRepayEvent)
            users.push({ user: zapRepayEvent.account, marketId: zapRepayEvent.market_id })
            this.pushOrCreate(
              {
                market: contractAddress,
                user: zapRepayEvent.account,
                isRepay: true,
                amount: debtShares,
                blockId: zapRepayEvent.block_id,
                txHash: zapRepayEvent.tx_hash,
              },
              debtSharesCheckpoints
            )
          }
          break
        case "ZapRepayAndWithdraw":
          {
            const zapRepayAndWithdrawEvent = parseZapRepayAndWithdrawEvent(log, mapMarketIdPerAddresses)
            const debtShares = BigInt(zapRepayAndWithdrawEvent.debt_shares)
            activeBorrowActions.push({
              user: zapRepayAndWithdrawEvent.account,
              marketId: Number(zapRepayAndWithdrawEvent.market_id),
              debt_shares: BigInt(zapRepayAndWithdrawEvent.debt_shares),
              blockId: zapRepayAndWithdrawEvent.block_id,
            })
            sortedAndParsedEvents.ZapRepayAndWithdraw.push(zapRepayAndWithdrawEvent)
            users.push({ user: zapRepayAndWithdrawEvent.account, marketId: zapRepayAndWithdrawEvent.market_id })
            this.pushOrCreate(
              {
                market: contractAddress,
                user: zapRepayAndWithdrawEvent.account,
                isRepay: true,
                amount: debtShares,
                blockId: zapRepayAndWithdrawEvent.block_id,
                txHash: zapRepayAndWithdrawEvent.tx_hash,
              },
              debtSharesCheckpoints
            )
          }
          break
        case "Withdraw":
          {
            const withdrawEvent = parseWithdrawEvent(log, mapMarketIdPerAddresses)
            sortedAndParsedEvents.Withdraw.push(withdrawEvent)
          }

          break
        case "Deposit":
          {
            const depositEvent = parseDepositEvent(log, mapMarketIdPerAddresses)
            sortedAndParsedEvents.Deposit.push(depositEvent)
          }

          break
        case "Borrow":
          {
            const borrowEvent = parseBorrowEvent(log, mapMarketIdPerAddresses)
            const debtShares = BigInt(borrowEvent.debt_shares)
            activeBorrowActions.push({
              user: borrowEvent.account,
              marketId: Number(borrowEvent.market_id),
              debt_shares: BigInt(borrowEvent.debt_shares),
              blockId: borrowEvent.block_id,
            })
            sortedAndParsedEvents.Borrow.push(borrowEvent)
            users.push({ user: borrowEvent.account, marketId: borrowEvent.market_id })
            this.pushOrCreate(
              {
                market: contractAddress,
                user: borrowEvent.account,
                isRepay: false,
                amount: debtShares,
                blockId: borrowEvent.block_id,
                txHash: borrowEvent.tx_hash,
              },
              debtSharesCheckpoints
            )
          }
          break
        case "ZapDeposit":
          {
            const zapDeposit = parseZapDepositEvent(log, mapMarketIdPerAddresses)
            sortedAndParsedEvents.ZapDeposit.push(zapDeposit)
          }
          break
        case "DepositAndBorrow":
          {
            const depositAndBorrowEvent = parseDepositAndBorrowEvent(log, mapMarketIdPerAddresses)
            const debtShares = BigInt(depositAndBorrowEvent.debt_shares)
            activeBorrowActions.push({
              user: depositAndBorrowEvent.account,
              marketId: Number(depositAndBorrowEvent.market_id),
              debt_shares: BigInt(depositAndBorrowEvent.debt_shares),
              blockId: depositAndBorrowEvent.block_id,
            })
            sortedAndParsedEvents.DepositAndBorrow.push(depositAndBorrowEvent)
            users.push({ user: depositAndBorrowEvent.account, marketId: depositAndBorrowEvent.market_id })
            this.pushOrCreate(
              {
                market: contractAddress,
                user: depositAndBorrowEvent.account,
                isRepay: false,
                amount: debtShares,
                blockId: depositAndBorrowEvent.block_id,
                txHash: depositAndBorrowEvent.tx_hash,
              },
              debtSharesCheckpoints
            )
          }
          break
        case "ZapDepositAndBorrow":
          {
            const zapDepositAndBorrowEvent = parseZapDepositAndBorrowEvent(log, mapMarketIdPerAddresses)
            const debtShares = BigInt(zapDepositAndBorrowEvent.debt_shares)
            activeBorrowActions.push({
              user: zapDepositAndBorrowEvent.account,
              marketId: Number(zapDepositAndBorrowEvent.market_id),
              debt_shares: BigInt(zapDepositAndBorrowEvent.debt_shares),
              blockId: zapDepositAndBorrowEvent.block_id,
            })
            sortedAndParsedEvents.ZapDepositAndBorrow.push(zapDepositAndBorrowEvent)
            users.push({ user: zapDepositAndBorrowEvent.account, marketId: zapDepositAndBorrowEvent.market_id })
            this.pushOrCreate(
              {
                market: contractAddress,
                user: zapDepositAndBorrowEvent.account,
                isRepay: false,
                amount: debtShares,
                blockId: zapDepositAndBorrowEvent.block_id,
                txHash: zapDepositAndBorrowEvent.tx_hash,
              },
              debtSharesCheckpoints
            )
          }
          break
        case "Leverage":
          {
            const leverageEvent = parseLeverageEvent(log, mapMarketIdPerAddresses)
            const debtShares = BigInt(leverageEvent.debt_shares)
            activeBorrowActions.push({
              user: leverageEvent.account,
              marketId: Number(leverageEvent.market_id),
              debt_shares: BigInt(leverageEvent.debt_shares),
              blockId: leverageEvent.block_id,
            })
            sortedAndParsedEvents.Leverage.push(leverageEvent)
            users.push({ user: leverageEvent.account, marketId: leverageEvent.market_id })
            this.pushOrCreate(
              {
                market: contractAddress,
                user: leverageEvent.account,
                isRepay: false,
                amount: debtShares,
                blockId: leverageEvent.block_id,
                txHash: leverageEvent.tx_hash,
              },
              debtSharesCheckpoints
            )
          }
          break
        case "ZapLeverage":
          {
            const zapLeverageEvent = parseZapLeverageEvent(log, mapMarketIdPerAddresses)
            const debtShares = BigInt(zapLeverageEvent.debt_shares)
            activeBorrowActions.push({
              user: zapLeverageEvent.account,
              marketId: Number(zapLeverageEvent.market_id),
              debt_shares: BigInt(zapLeverageEvent.debt_shares),
              blockId: zapLeverageEvent.block_id,
            })
            sortedAndParsedEvents.ZapLeverage.push(zapLeverageEvent)
            users.push({ user: zapLeverageEvent.account, marketId: zapLeverageEvent.market_id })
            this.pushOrCreate(
              {
                market: contractAddress,
                user: zapLeverageEvent.account,
                isRepay: false,
                amount: debtShares,
                blockId: zapLeverageEvent.block_id,
                txHash: zapLeverageEvent.tx_hash,
              },
              debtSharesCheckpoints
            )
          }
          break
        case "Liquidate":
          {
            const liquidateEvent = parseLiquidateEvent(log, mapMarketIdPerAddresses)
            const debtShares = BigInt(liquidateEvent.debt_shares)
            activeBorrowActions.push({
              user: liquidateEvent.account,
              marketId: Number(liquidateEvent.market_id),
              debt_shares: BigInt(liquidateEvent.debt_shares),
              blockId: liquidateEvent.block_id,
            })
            sortedAndParsedEvents.Liquidate.push(liquidateEvent)
            users.push({ user: liquidateEvent.account, marketId: liquidateEvent.market_id })
            this.pushOrCreate(
              {
                market: contractAddress,
                user: liquidateEvent.account,
                isRepay: true,
                amount: debtShares,
                blockId: liquidateEvent.block_id,
                txHash: liquidateEvent.tx_hash,
              },
              debtSharesCheckpoints
            )
          }
          break
        case "SelfLiquidate":
          {
            const selfLiquidateEvent = parseSelfLiquidateEvent(log, mapMarketIdPerAddresses)
            const debtShares = BigInt(selfLiquidateEvent.debt_shares)

            activeBorrowActions.push({
              user: selfLiquidateEvent.account,
              marketId: Number(selfLiquidateEvent.market_id),
              debt_shares: BigInt(selfLiquidateEvent.debt_shares),
              blockId: selfLiquidateEvent.block_id,
            })
            sortedAndParsedEvents.SelfLiquidate.push(selfLiquidateEvent)
            users.push({ user: selfLiquidateEvent.account, marketId: selfLiquidateEvent.market_id })
            this.pushOrCreate(
              {
                market: contractAddress,
                user: selfLiquidateEvent.account,
                isRepay: true,
                amount: debtShares,
                blockId: selfLiquidateEvent.block_id,
                txHash: selfLiquidateEvent.tx_hash,
              },
              debtSharesCheckpoints
            )
          }
          break
        case "SeizeCollateral":
          {
            const seizeCollateralEvent = parseSeizeCollateralEvent(log, mapMarketIdPerAddresses)
            const debtShares = 0n

            activeBorrowActions.push({
              user: seizeCollateralEvent.account,
              marketId: Number(seizeCollateralEvent.market_id),
              debt_shares: debtShares,
              blockId: seizeCollateralEvent.block_id,
            })
            sortedAndParsedEvents.SeizeCollateral.push(seizeCollateralEvent)
            users.push({ user: seizeCollateralEvent.account, marketId: seizeCollateralEvent.market_id })
            this.pushOrCreate(
              {
                market: contractAddress,
                user: seizeCollateralEvent.account,
                isRepay: true,
                amount: debtShares,
                blockId: seizeCollateralEvent.block_id,
                txHash: seizeCollateralEvent.tx_hash,
              },
              debtSharesCheckpoints
            )
          }
          break
        case "MigrateFrom":
          {
            const migrateFromEvent = parseMigrateFromEvent(log, mapMarketIdPerAddresses)
            const debtShares = BigInt(migrateFromEvent.debt_shares)

            activeBorrowActions.push({
              user: migrateFromEvent.account,
              marketId: Number(migrateFromEvent.market_id),
              debt_shares: BigInt(migrateFromEvent.debt_shares),
              blockId: migrateFromEvent.block_id,
            })
            sortedAndParsedEvents.MigrateFrom.push(migrateFromEvent)
            users.push({ user: migrateFromEvent.account, marketId: migrateFromEvent.market_id })
            this.pushOrCreate(
              {
                market: contractAddress,
                user: migrateFromEvent.account,
                isRepay: true,
                amount: debtShares,
                blockId: migrateFromEvent.block_id,
                txHash: migrateFromEvent.tx_hash,
              },
              debtSharesCheckpoints
            )
          }
          break
        case "MigrateTo":
          {
            const migrateToEvent = parseMigrateToEvent(log, mapMarketIdPerAddresses)
            const debtShares = BigInt(migrateToEvent.debt_shares)

            activeBorrowActions.push({
              user: migrateToEvent.account,
              marketId: Number(migrateToEvent.market_id),
              debt_shares: BigInt(migrateToEvent.debt_shares),
              blockId: migrateToEvent.block_id,
            })
            sortedAndParsedEvents.MigrateTo.push(migrateToEvent)
            users.push({ user: migrateToEvent.account, marketId: migrateToEvent.market_id })
            this.pushOrCreate(
              {
                market: contractAddress,
                user: migrateToEvent.account,
                isRepay: false,
                amount: debtShares,
                blockId: migrateToEvent.block_id,
                txHash: migrateToEvent.tx_hash,
              },
              debtSharesCheckpoints
            )
          }
          break
        default:
          break
      }
    })

    // Look for
    return { sortedAndParsedEvents, activeBorrowActions, blockIds: Array.from(uniqueBlockId), users, debtSharesCheckpoints }
  }
}
