import { AddressLike, Log } from "ethers"
import { EVENT_TOPICS } from "../../eventFectcher/marketUserEvents.signatures"
import {
  parseBorrowEvent,
  parseDepositAndBorrowEvent,
  parseDepositEvent,
  parseLeverageEvent,
  parseRepayAndWithdrawEvent,
  parseRepayEvent,
  parseWithdrawEvent,
  parseZapDepositAndBorrowEvent,
  parseZapDepositEvent,
  parseZapLeverageEvent,
  parseZapRepayAndWithdrawEvent,
  parseZapRepayEvent,
} from "../../eventFectcher/marketUserEvents.parsers"
import { UserEventsRepository } from "db/UserEventsRepository"
import { Prisma } from "@prisma/client"

export type UserAction = {
  user: AddressLike
  market: AddressLike
  blockId: number
  isBorrow?: boolean
  isRepayAll?: boolean
  timestamp?: Date
}

export type SortedEvents = {
  Deposit: Prisma.market_depositCreateInput[]
  ZapDeposit: Prisma.market_zap_depositCreateInput[]
  DepositAndBorrow: Prisma.market_deposit_and_borrowCreateInput[]
  ZapDepositAndBorrow: Prisma.market_zap_deposit_and_borrowCreateInput[]
  Repay: Prisma.market_repayCreateInput[]
  ZapRepay: Prisma.market_zap_repayCreateInput[]
  RepayAndWithdraw: Prisma.market_repay_and_withdrawCreateInput[]
  ZapRepayAndWithdraw: Prisma.market_zap_repay_and_withdrawCreateInput[]
  Withdraw: Prisma.market_withdrawCreateInput[]
  Borrow: Prisma.market_borrowCreateInput[]
  Leverage: Prisma.market_leverageCreateInput[]
  ZapLeverage: Prisma.market_zap_leverageCreateInput[]
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
    await this.userEventsRepository.insertWithdraws(sortedParsedEvents.Withdraw)
    await this.userEventsRepository.insertBorrows(sortedParsedEvents.Borrow)
    await this.userEventsRepository.insertRepays(sortedParsedEvents.Repay)
    await this.userEventsRepository.insertZapRepays(sortedParsedEvents.ZapRepay)
    await this.userEventsRepository.insertRepayAndWithdraws(sortedParsedEvents.RepayAndWithdraw)
    await this.userEventsRepository.insertZapRepayAndWithdraws(sortedParsedEvents.ZapRepayAndWithdraw)
    await this.userEventsRepository.insertLeverages(sortedParsedEvents.Leverage)
    await this.userEventsRepository.insertZapLeverages(sortedParsedEvents.ZapLeverage)
  }

  replaceRightDates(sortedParsedEvents: SortedEvents, userActions: UserAction[], blockInfos: Map<number, number>) {
    Object.values(sortedParsedEvents).forEach((v) => {
      v.forEach((event) => {
        event.block_date = new Date(blockInfos.get(event.block_id)!)
      })
    })

    userActions.forEach((userAction) => {
      userAction.timestamp = new Date(blockInfos.get(userAction.blockId)!)
    })

    return { sortedParsedEvents, userActions }
  }

  sortUserMarketLogs(logs: Log[]) {
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
    }

    const uniqueBlockId: Set<number> = new Set()

    logs.forEach((log) => {
      const eventTopic = log.topics[0]
      const eventType = EVENT_TOPICS[eventTopic]
      let activeBorrowAction: UserAction = { user: "", market: "", blockId: 0 }
      let isImpactingActiveBorrows = false

      uniqueBlockId.add(log.blockNumber)

      switch (eventType) {
        case "Repay":
          const repayEvent = parseRepayEvent(log)
          activeBorrowAction = {
            user: repayEvent.account,
            market: repayEvent.market,
            isRepayAll: repayEvent.is_repay_all,
            blockId: repayEvent.block_id,
          }
          isImpactingActiveBorrows = true
          sortedAndParsedEvents.Repay.push(repayEvent)
          break
        case "RepayAndWithdraw":
          const repayAndWithdrawEvent = parseRepayAndWithdrawEvent(log)
          activeBorrowAction = {
            user: repayAndWithdrawEvent.account,
            market: repayAndWithdrawEvent.market,
            isRepayAll: repayAndWithdrawEvent.is_repay_all,
            blockId: repayAndWithdrawEvent.block_id,
          }
          isImpactingActiveBorrows = true
          sortedAndParsedEvents.RepayAndWithdraw.push(repayAndWithdrawEvent)
          break
        case "ZapRepay":
          const zapRepayEvent = parseZapRepayEvent(log)
          activeBorrowAction = {
            user: zapRepayEvent.account,
            market: zapRepayEvent.market,
            isRepayAll: zapRepayEvent.is_repay_all,
            blockId: zapRepayEvent.block_id,
          }
          isImpactingActiveBorrows = true
          sortedAndParsedEvents.ZapRepay.push(zapRepayEvent)
          break
        case "ZapRepayAndWithdraw":
          const zapRepayAndWithdrawEvent = parseZapRepayAndWithdrawEvent(log)
          activeBorrowAction = {
            user: zapRepayAndWithdrawEvent.account,
            market: zapRepayAndWithdrawEvent.market,
            isRepayAll: zapRepayAndWithdrawEvent.is_repay_all,
            blockId: zapRepayAndWithdrawEvent.block_id,
          }
          isImpactingActiveBorrows = true
          sortedAndParsedEvents.ZapRepayAndWithdraw.push(zapRepayAndWithdrawEvent)

          break
        case "Withdraw":
          const withdrawEvent = parseWithdrawEvent(log)
          sortedAndParsedEvents.Withdraw.push(withdrawEvent)

          break
        case "Deposit":
          const depositEvent = parseDepositEvent(log)
          sortedAndParsedEvents.Deposit.push(depositEvent)

          break
        case "Borrow":
          const borrowEvent = parseBorrowEvent(log)
          activeBorrowAction = {
            user: borrowEvent.account,
            market: borrowEvent.market,
            isBorrow: true,
            blockId: borrowEvent.block_id,
          }
          isImpactingActiveBorrows = true
          sortedAndParsedEvents.Borrow.push(borrowEvent)

          break
        case "ZapDeposit":
          const zapDeposit = parseZapDepositEvent(log)
          sortedAndParsedEvents.ZapDeposit.push(zapDeposit)

          break
        case "DepositAndBorrow":
          const depositAndBorrowEvent = parseDepositAndBorrowEvent(log)
          activeBorrowAction = {
            user: depositAndBorrowEvent.account,
            market: depositAndBorrowEvent.market,
            isBorrow: true,
            isRepayAll: false,
            blockId: depositAndBorrowEvent.block_id,
          }
          isImpactingActiveBorrows = true
          sortedAndParsedEvents.DepositAndBorrow.push(depositAndBorrowEvent)
          break

        case "ZapDepositAndBorrow":
          const zapDepositAndBorrowEvent = parseZapDepositAndBorrowEvent(log)
          activeBorrowAction = {
            user: zapDepositAndBorrowEvent.account,
            market: zapDepositAndBorrowEvent.market,
            isBorrow: true,
            blockId: zapDepositAndBorrowEvent.block_id,
          }
          isImpactingActiveBorrows = true
          sortedAndParsedEvents.ZapDepositAndBorrow.push(zapDepositAndBorrowEvent)
          break

        case "Leverage":
          const leverageEvent = parseLeverageEvent(log)
          activeBorrowAction = {
            user: leverageEvent.account,
            market: leverageEvent.market,
            isBorrow: true,
            isRepayAll: false,
            blockId: leverageEvent.block_id,
          }
          isImpactingActiveBorrows = true
          sortedAndParsedEvents.Leverage.push(leverageEvent)
          break

        case "ZapLeverage":
          const zapLeverageEvent = parseZapLeverageEvent(log)
          activeBorrowAction = {
            user: zapLeverageEvent.account,
            market: zapLeverageEvent.market,
            isBorrow: true,
            isRepayAll: false,
            blockId: zapLeverageEvent.block_id,
          }
          isImpactingActiveBorrows = true
          sortedAndParsedEvents.ZapLeverage.push(zapLeverageEvent)
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
