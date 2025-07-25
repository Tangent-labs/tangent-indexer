import { AddressLike, Log } from "ethers"
import { Prisma } from "@prisma/client"

import { EVENT_TOPICS } from "../../resources/eventSignatures"
import {
  parseBorrowEvent,
  parseDepositAndBorrowEvent,
  parseDepositEvent,
  parseLeverageEvent,
  parseLiquidateEvent,
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
} from "../../eventFectcher/marketUserEvents.parsers"
import { UserEventsRepository } from "../../db/UserEventsRepository"

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
    }

    const uniqueBlockId: Set<number> = new Set()

    logs.forEach((log) => {
      const eventTopic = log.topics[0]
      const eventType = EVENT_TOPICS[eventTopic]
      let activeBorrowAction: UserAction = { user: "", marketId: NaN, debt_shares: 0n, blockId: 0 }
      let isImpactingActiveBorrows = false

      uniqueBlockId.add(log.blockNumber)

      switch (eventType) {
        case "Repay":
          const repayEvent = parseRepayEvent(log, mapMarketIdPerAddresses)
          activeBorrowAction = {
            user: repayEvent.account,
            marketId: Number(repayEvent.market_id),
            debt_shares: BigInt(repayEvent.debt_shares),
            blockId: repayEvent.block_id,
          }
          isImpactingActiveBorrows = true
          sortedAndParsedEvents.Repay.push(repayEvent)
          break
        case "RepayAndWithdraw":
          const repayAndWithdrawEvent = parseRepayAndWithdrawEvent(log, mapMarketIdPerAddresses)
          activeBorrowAction = {
            user: repayAndWithdrawEvent.account,
            marketId: Number(repayAndWithdrawEvent.market_id),
            debt_shares: BigInt(repayAndWithdrawEvent.debt_shares),
            blockId: repayAndWithdrawEvent.block_id,
          }
          isImpactingActiveBorrows = true
          sortedAndParsedEvents.RepayAndWithdraw.push(repayAndWithdrawEvent)
          break
        case "ZapRepay":
          const zapRepayEvent = parseZapRepayEvent(log, mapMarketIdPerAddresses)
          activeBorrowAction = {
            user: zapRepayEvent.account,
            marketId: Number(zapRepayEvent.market_id),
            debt_shares: BigInt(zapRepayEvent.debt_shares),
            blockId: zapRepayEvent.block_id,
          }
          isImpactingActiveBorrows = true
          sortedAndParsedEvents.ZapRepay.push(zapRepayEvent)
          break
        case "ZapRepayAndWithdraw":
          const zapRepayAndWithdrawEvent = parseZapRepayAndWithdrawEvent(log, mapMarketIdPerAddresses)
          activeBorrowAction = {
            user: zapRepayAndWithdrawEvent.account,
            marketId: Number(zapRepayAndWithdrawEvent.market_id),
            debt_shares: BigInt(zapRepayAndWithdrawEvent.debt_shares),
            blockId: zapRepayAndWithdrawEvent.block_id,
          }
          isImpactingActiveBorrows = true
          sortedAndParsedEvents.ZapRepayAndWithdraw.push(zapRepayAndWithdrawEvent)

          break
        case "Withdraw":
          const withdrawEvent = parseWithdrawEvent(log, mapMarketIdPerAddresses)
          sortedAndParsedEvents.Withdraw.push(withdrawEvent)

          break
        case "Deposit":
          const depositEvent = parseDepositEvent(log, mapMarketIdPerAddresses)
          sortedAndParsedEvents.Deposit.push(depositEvent)

          break
        case "Borrow":
          const borrowEvent = parseBorrowEvent(log, mapMarketIdPerAddresses)
          activeBorrowAction = {
            user: borrowEvent.account,
            marketId: Number(borrowEvent.market_id),
            debt_shares: BigInt(borrowEvent.debt_shares),
            blockId: borrowEvent.block_id,
          }
          isImpactingActiveBorrows = true
          sortedAndParsedEvents.Borrow.push(borrowEvent)

          break
        case "ZapDeposit":
          const zapDeposit = parseZapDepositEvent(log, mapMarketIdPerAddresses)
          sortedAndParsedEvents.ZapDeposit.push(zapDeposit)

          break
        case "DepositAndBorrow":
          const depositAndBorrowEvent = parseDepositAndBorrowEvent(log, mapMarketIdPerAddresses)
          activeBorrowAction = {
            user: depositAndBorrowEvent.account,
            marketId: Number(depositAndBorrowEvent.market_id),
            debt_shares: BigInt(depositAndBorrowEvent.debt_shares),
            blockId: depositAndBorrowEvent.block_id,
          }
          isImpactingActiveBorrows = true
          sortedAndParsedEvents.DepositAndBorrow.push(depositAndBorrowEvent)
          break

        case "ZapDepositAndBorrow":
          const zapDepositAndBorrowEvent = parseZapDepositAndBorrowEvent(log, mapMarketIdPerAddresses)
          activeBorrowAction = {
            user: zapDepositAndBorrowEvent.account,
            marketId: Number(zapDepositAndBorrowEvent.market_id),
            debt_shares: BigInt(zapDepositAndBorrowEvent.debt_shares),
            blockId: zapDepositAndBorrowEvent.block_id,
          }
          isImpactingActiveBorrows = true
          sortedAndParsedEvents.ZapDepositAndBorrow.push(zapDepositAndBorrowEvent)
          break

        case "Leverage":
          const leverageEvent = parseLeverageEvent(log, mapMarketIdPerAddresses)
          activeBorrowAction = {
            user: leverageEvent.account,
            marketId: Number(leverageEvent.market_id),
            debt_shares: BigInt(leverageEvent.debt_shares),
            blockId: leverageEvent.block_id,
          }
          isImpactingActiveBorrows = true
          sortedAndParsedEvents.Leverage.push(leverageEvent)
          break

        case "ZapLeverage":
          const zapLeverageEvent = parseZapLeverageEvent(log, mapMarketIdPerAddresses)
          activeBorrowAction = {
            user: zapLeverageEvent.account,
            marketId: Number(zapLeverageEvent.market_id),
            debt_shares: BigInt(zapLeverageEvent.debt_shares),
            blockId: zapLeverageEvent.block_id,
          }
          isImpactingActiveBorrows = true
          sortedAndParsedEvents.ZapLeverage.push(zapLeverageEvent)
          break

        case "Liquidate":
          const liquidateEvent = parseLiquidateEvent(log, mapMarketIdPerAddresses)
          activeBorrowAction = {
            user: liquidateEvent.account,
            marketId: Number(liquidateEvent.market_id),
            debt_shares: BigInt(liquidateEvent.debt_shares),
            blockId: liquidateEvent.block_id,
          }
          isImpactingActiveBorrows = true
          sortedAndParsedEvents.Liquidate.push(liquidateEvent)
          break

        case "SelfLiquidate":
          const selfLiquidateEvent = parseSelfLiquidateEvent(log, mapMarketIdPerAddresses)
          activeBorrowAction = {
            user: selfLiquidateEvent.account,
            marketId: Number(selfLiquidateEvent.market_id),
            debt_shares: BigInt(selfLiquidateEvent.debt_shares),
            blockId: selfLiquidateEvent.block_id,
          }
          isImpactingActiveBorrows = true
          sortedAndParsedEvents.SelfLiquidate.push(selfLiquidateEvent)
          break

        case "SeizeCollateral":
          const seizeCollateralEvent = parseSeizeCollateralEvent(log, mapMarketIdPerAddresses)
          activeBorrowAction = {
            user: seizeCollateralEvent.account,
            marketId: Number(seizeCollateralEvent.market_id),
            debt_shares: 0n,
            blockId: seizeCollateralEvent.block_id,
          }
          isImpactingActiveBorrows = true
          sortedAndParsedEvents.SeizeCollateral.push(seizeCollateralEvent)
          break

        default:
      }

      if (isImpactingActiveBorrows) {
        activeBorrowActions.push(activeBorrowAction)
      }
    })

    return { sortedAndParsedEvents, activeBorrowActions, blockIds: Array.from(uniqueBlockId) }
  }
}
