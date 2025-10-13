import { AddressLike, Log, ZeroAddress } from "ethers"
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

    const uniqueBlockId: Set<number> = new Set()
    const debtTransferEvents: Prisma.transfer_eventsCreateManyInput[] = []

    logs.forEach((log) => {
      const eventTopic = log.topics[0]

      const eventType = EVENT_TOPICS[eventTopic]

      uniqueBlockId.add(log.blockNumber)

      switch (eventType) {
        case "Repay":
          {
            const repayEvent = parseRepayEvent(log, mapMarketIdPerAddresses)
            activeBorrowActions.push({
              user: repayEvent.account,
              marketId: Number(repayEvent.market_id),
              debt_shares: BigInt(repayEvent.debt_shares),
              blockId: repayEvent.block_id,
            })
            sortedAndParsedEvents.Repay.push(repayEvent)
            debtTransferEvents.push({
              from: repayEvent.account,
              to: ZeroAddress,
              amount: repayEvent.debt_shares,
              tx_hash: repayEvent.tx_hash,
              block_id: repayEvent.block_id,
              token_address: log.address.toLowerCase(),
              block_date: new Date(),
            })
          }
          break
        case "RepayAndWithdraw":
          {
            const repayAndWithdrawEvent = parseRepayAndWithdrawEvent(log, mapMarketIdPerAddresses)
            activeBorrowActions.push({
              user: repayAndWithdrawEvent.account,
              marketId: Number(repayAndWithdrawEvent.market_id),
              debt_shares: BigInt(repayAndWithdrawEvent.debt_shares),
              blockId: repayAndWithdrawEvent.block_id,
            })
            sortedAndParsedEvents.RepayAndWithdraw.push(repayAndWithdrawEvent)
            debtTransferEvents.push({
              from: repayAndWithdrawEvent.account,
              to: ZeroAddress,
              amount: repayAndWithdrawEvent.debt_shares,
              tx_hash: repayAndWithdrawEvent.tx_hash,
              block_id: repayAndWithdrawEvent.block_id,
              token_address: log.address.toLowerCase(),
              block_date: new Date(),
            })
          }
          break
        case "ZapRepay":
          {
            const zapRepayEvent = parseZapRepayEvent(log, mapMarketIdPerAddresses)
            activeBorrowActions.push({
              user: zapRepayEvent.account,
              marketId: Number(zapRepayEvent.market_id),
              debt_shares: BigInt(zapRepayEvent.debt_shares),
              blockId: zapRepayEvent.block_id,
            })
            sortedAndParsedEvents.ZapRepay.push(zapRepayEvent)

            debtTransferEvents.push({
              from: zapRepayEvent.account,
              to: ZeroAddress,
              amount: zapRepayEvent.debt_shares,
              tx_hash: zapRepayEvent.tx_hash,
              block_id: zapRepayEvent.block_id,
              token_address: log.address.toLowerCase(),
              block_date: new Date(),
            })
          }
          break
        case "ZapRepayAndWithdraw":
          {
            const zapRepayAndWithdrawEvent = parseZapRepayAndWithdrawEvent(log, mapMarketIdPerAddresses)
            activeBorrowActions.push({
              user: zapRepayAndWithdrawEvent.account,
              marketId: Number(zapRepayAndWithdrawEvent.market_id),
              debt_shares: BigInt(zapRepayAndWithdrawEvent.debt_shares),
              blockId: zapRepayAndWithdrawEvent.block_id,
            })
            sortedAndParsedEvents.ZapRepayAndWithdraw.push(zapRepayAndWithdrawEvent)
            debtTransferEvents.push({
              from: zapRepayAndWithdrawEvent.account,
              to: ZeroAddress,
              amount: zapRepayAndWithdrawEvent.debt_shares,
              tx_hash: zapRepayAndWithdrawEvent.tx_hash,
              block_id: zapRepayAndWithdrawEvent.block_id,
              token_address: log.address.toLowerCase(),
              block_date: new Date(),
            })
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
            activeBorrowActions.push({
              user: borrowEvent.account,
              marketId: Number(borrowEvent.market_id),
              debt_shares: BigInt(borrowEvent.debt_shares),
              blockId: borrowEvent.block_id,
            })
            sortedAndParsedEvents.Borrow.push(borrowEvent)
            debtTransferEvents.push({
              from: ZeroAddress,
              to: borrowEvent.account,
              amount: borrowEvent.debt_shares,
              tx_hash: borrowEvent.tx_hash,
              block_id: borrowEvent.block_id,
              token_address: log.address.toLowerCase(),
              block_date: new Date(),
            })
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
            activeBorrowActions.push({
              user: depositAndBorrowEvent.account,
              marketId: Number(depositAndBorrowEvent.market_id),
              debt_shares: BigInt(depositAndBorrowEvent.debt_shares),
              blockId: depositAndBorrowEvent.block_id,
            })
            sortedAndParsedEvents.DepositAndBorrow.push(depositAndBorrowEvent)
            debtTransferEvents.push({
              from: ZeroAddress,
              to: depositAndBorrowEvent.account,
              amount: depositAndBorrowEvent.debt_shares,
              tx_hash: depositAndBorrowEvent.tx_hash,
              block_id: depositAndBorrowEvent.block_id,
              token_address: log.address.toLowerCase(),
              block_date: new Date(),
            })
          }
          break
        case "ZapDepositAndBorrow":
          {
            const zapDepositAndBorrowEvent = parseZapDepositAndBorrowEvent(log, mapMarketIdPerAddresses)
            activeBorrowActions.push({
              user: zapDepositAndBorrowEvent.account,
              marketId: Number(zapDepositAndBorrowEvent.market_id),
              debt_shares: BigInt(zapDepositAndBorrowEvent.debt_shares),
              blockId: zapDepositAndBorrowEvent.block_id,
            })
            sortedAndParsedEvents.ZapDepositAndBorrow.push(zapDepositAndBorrowEvent)
            debtTransferEvents.push({
              from: ZeroAddress,
              to: zapDepositAndBorrowEvent.account,
              amount: zapDepositAndBorrowEvent.debt_shares,
              tx_hash: zapDepositAndBorrowEvent.tx_hash,
              block_id: zapDepositAndBorrowEvent.block_id,
              token_address: log.address.toLowerCase(),
              block_date: new Date(),
            })
          }
          break
        case "Leverage":
          {
            const leverageEvent = parseLeverageEvent(log, mapMarketIdPerAddresses)
            activeBorrowActions.push({
              user: leverageEvent.account,
              marketId: Number(leverageEvent.market_id),
              debt_shares: BigInt(leverageEvent.debt_shares),
              blockId: leverageEvent.block_id,
            })
            sortedAndParsedEvents.Leverage.push(leverageEvent)
            debtTransferEvents.push({
              from: ZeroAddress,
              to: leverageEvent.account,
              amount: leverageEvent.debt_shares,
              tx_hash: leverageEvent.tx_hash,
              block_id: leverageEvent.block_id,
              token_address: log.address.toLowerCase(),
              block_date: new Date(),
            })
          }
          break
        case "ZapLeverage":
          {
            const zapLeverageEvent = parseZapLeverageEvent(log, mapMarketIdPerAddresses)
            activeBorrowActions.push({
              user: zapLeverageEvent.account,
              marketId: Number(zapLeverageEvent.market_id),
              debt_shares: BigInt(zapLeverageEvent.debt_shares),
              blockId: zapLeverageEvent.block_id,
            })
            sortedAndParsedEvents.ZapLeverage.push(zapLeverageEvent)
            debtTransferEvents.push({
              from: ZeroAddress,
              to: zapLeverageEvent.account,
              amount: zapLeverageEvent.debt_shares,
              tx_hash: zapLeverageEvent.tx_hash,
              block_id: zapLeverageEvent.block_id,
              token_address: log.address.toLowerCase(),
              block_date: new Date(),
            })
          }
          break
        case "Liquidate":
          {
            const liquidateEvent = parseLiquidateEvent(log, mapMarketIdPerAddresses)
            activeBorrowActions.push({
              user: liquidateEvent.account,
              marketId: Number(liquidateEvent.market_id),
              debt_shares: BigInt(liquidateEvent.debt_shares),
              blockId: liquidateEvent.block_id,
            })
            sortedAndParsedEvents.Liquidate.push(liquidateEvent)
            debtTransferEvents.push({
              from: liquidateEvent.account,
              to: ZeroAddress,
              amount: liquidateEvent.debt_shares,
              tx_hash: liquidateEvent.tx_hash,
              block_id: liquidateEvent.block_id,
              token_address: log.address.toLowerCase(),
              block_date: new Date(),
            })
          }
          break
        case "SelfLiquidate":
          {
            const selfLiquidateEvent = parseSelfLiquidateEvent(log, mapMarketIdPerAddresses)
            activeBorrowActions.push({
              user: selfLiquidateEvent.account,
              marketId: Number(selfLiquidateEvent.market_id),
              debt_shares: BigInt(selfLiquidateEvent.debt_shares),
              blockId: selfLiquidateEvent.block_id,
            })
            sortedAndParsedEvents.SelfLiquidate.push(selfLiquidateEvent)
            debtTransferEvents.push({
              from: selfLiquidateEvent.account,
              to: ZeroAddress,
              amount: selfLiquidateEvent.debt_shares,
              tx_hash: selfLiquidateEvent.tx_hash,
              block_id: selfLiquidateEvent.block_id,
              token_address: log.address.toLowerCase(),
              block_date: new Date(),
            })
          }
          break
        case "SeizeCollateral":
          {
            const seizeCollateralEvent = parseSeizeCollateralEvent(log, mapMarketIdPerAddresses)
            activeBorrowActions.push({
              user: seizeCollateralEvent.account,
              marketId: Number(seizeCollateralEvent.market_id),
              debt_shares: 0n,
              blockId: seizeCollateralEvent.block_id,
            })
            sortedAndParsedEvents.SeizeCollateral.push(seizeCollateralEvent)
            debtTransferEvents.push({
              from: seizeCollateralEvent.account,
              to: ZeroAddress,
              amount: "0",
              tx_hash: seizeCollateralEvent.tx_hash,
              block_id: seizeCollateralEvent.block_id,
              token_address: log.address.toLowerCase(),
              block_date: new Date(),
            })
          }
          break
        case "MigrateFrom":
          {
            const migrateFromEvent = parseMigrateFromEvent(log, mapMarketIdPerAddresses)
            activeBorrowActions.push({
              user: migrateFromEvent.account,
              marketId: Number(migrateFromEvent.market_id),
              debt_shares: BigInt(migrateFromEvent.debt_shares),
              blockId: migrateFromEvent.block_id,
            })
            sortedAndParsedEvents.MigrateFrom.push(migrateFromEvent)
            debtTransferEvents.push({
              from: migrateFromEvent.account,
              to: ZeroAddress,
              amount: "0",
              tx_hash: migrateFromEvent.tx_hash,
              block_id: migrateFromEvent.block_id,
              token_address: log.address.toLowerCase(),
              block_date: new Date(),
            })
          }
          break
        case "MigrateTo":
          {
            const migrateToEvent = parseMigrateToEvent(log, mapMarketIdPerAddresses)
            activeBorrowActions.push({
              user: migrateToEvent.account,
              marketId: Number(migrateToEvent.market_id),
              debt_shares: BigInt(migrateToEvent.debt_shares),
              blockId: migrateToEvent.block_id,
            })
            sortedAndParsedEvents.MigrateTo.push(migrateToEvent)
            debtTransferEvents.push({
              from: ZeroAddress,
              to: migrateToEvent.account,
              amount: "0",
              tx_hash: migrateToEvent.tx_hash,
              block_id: migrateToEvent.block_id,
              token_address: log.address.toLowerCase(),
              block_date: new Date(),
            })
          }
          break
        default:
          break
      }
    })
    return { sortedAndParsedEvents, activeBorrowActions, blockIds: Array.from(uniqueBlockId), debtTransferEvents }
  }
}
