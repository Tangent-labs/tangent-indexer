import { Prisma } from "@prisma/client"
import { Log, ZeroAddress } from "ethers"

import { UserPointsLPRepository } from "../../db/Points/UserPointsLPRepository.js"
import { ERC20Repository } from "../../db/ERC20Repository.js"

import {
  parseAddLiquidity,
  parseAddLiquidity2,
  parseStakeConvexEvent,
  parseTransferEvent,
  parseWithdrawConvexEvent,
} from "../../eventFectcher/marketUserEvents.parsers.js"
import { TRANSFER_TOPICS } from "../../eventFectcher/erc20TransferEventFetcher.js"
import { DebtSharesCheckpointStruct } from "./UserMarketService.js"
import { ActiveBorrowersRepository } from "../../db/ActiveBorrowersRepository.js"

export type SortedEvents = {
  Transfer: Prisma.transfer_eventsCreateManyInput[]
}

type LpUserTaskPoolItem = {
  id: bigint
  task_id: bigint
  user_address: string
  start_date: Date
  amount: string
  closed_date: Date | null
}

export class UserPointsService {
  userPointsRepository: UserPointsLPRepository
  erc20Repository: ERC20Repository
  activeBorrowersRepository: ActiveBorrowersRepository

  constructor(userPointsRepository: UserPointsLPRepository, erc20Repository: ERC20Repository, activeBorrowersRepository: ActiveBorrowersRepository) {
    this.userPointsRepository = userPointsRepository
    this.erc20Repository = erc20Repository
    this.activeBorrowersRepository = activeBorrowersRepository
  }

  retrieveUserAddressesFromTransfers = async (startBlock: number, endBlock: number) => {
    const uniqueAddresses = await this.userPointsRepository.getUniqueAddressesFromTransfers(startBlock, endBlock)
    await this.userPointsRepository.insertAddresses(uniqueAddresses)
  }

  async updateLPUserTasks(startBlock: number, endBlock: number, blockDates: Map<number, number>) {
    // Retrieve transfer events
    const { tasks, transferEvents } = await this.userPointsRepository.fetchTasksEventsAndAddresses(startBlock, endBlock, blockDates)
    const toExclude = (await this.userPointsRepository.getAddressesExcludedFromLpPoints()).map((u) => u.user)
    transferEvents.sort((a, b) => {
      if (a.block_id !== b.block_id) return a.block_id - b.block_id
      return a.block_date.getTime() - b.block_date.getTime()
    })

    // Merge all concerned account in one set
    const allUserAddresses = new Set<string>()
    transferEvents.forEach((event) => {
      allUserAddresses.add(event.from.toLowerCase())
      allUserAddresses.add(event.to.toLowerCase())
    })

    // Remove addresses to exclude
    toExclude.forEach((u) => {
      if (allUserAddresses.has(u)) {
        allUserAddresses.delete(u)
      }
    })

    // Retrieve all the opened tasks for all concerned users
    const openUserTasks = await this.userPointsRepository.getOpenedTasks(
      Array.from(allUserAddresses),
      tasks.map((task) => task.id)
    )

    const taskPool: LpUserTaskPoolItem[] = []

    // Add all open tasks from DB to taskPool
    for (const openUserTask of openUserTasks) {
      taskPool.push(openUserTask as LpUserTaskPoolItem)
    }

    // Iterate over all transfer events
    for (const event of transferEvents) {
      const task = tasks.find((t) => t.token.address.toLowerCase() === event.token_address?.toLowerCase())

      if (!task) {
        console.warn(`No matching task for token ${event.token_address}, skipping`)
        break
      }

      // Iterate over address from and to of transfer event
      for (const userAddressRaw of [event.from, event.to]) {
        const userAddress = userAddressRaw.toLowerCase()

        // Don't consider addresses that are in toExclude array
        if (!toExclude.includes(userAddress)) {
          const isSender = userAddress === event.from?.toLowerCase()

          // Find open task of the user in taskPool
          const openTask = taskPool.find((t) => t.user_address.toLowerCase() === userAddress && t.task_id === task.id && t.closed_date === null)

          // There is no open task for this specific task/user, so we have to create one
          if (!openTask) {
            taskPool.push({
              id: 0n, // synthetic
              task_id: task.id,
              user_address: userAddress,
              start_date: event.block_date,
              amount: event.amount,
              closed_date: null,
            })
          }
          // An open task exists for these specific task/user, we need to close it
          else {
            const closedAt = new Date(event.block_date)
            // Close the existing task
            openTask.closed_date = closedAt

            // Calculate new amount and create a new task if needed
            const currentAmount = BigInt(openTask.amount)
            const delta = BigInt(event.amount)
            const newAmount = isSender ? currentAmount - delta : currentAmount + delta

            if (newAmount !== 0n) {
              // Create new open task
              taskPool.push({
                id: 0n, // synthetic
                task_id: task.id,
                user_address: userAddress,
                start_date: event.block_date,
                amount: newAmount.toString(),
                closed_date: null,
              })
            }
          }
        }
      }
    }
    // const taskToclose= openTaskMap.values().filter((t) => t.closed !== null && id!==Bigint(0))
    // const tasksToCreate= openTaskMap.values().filter((t) => id===Bigint(0))

    const userTasksToClose = taskPool.filter((t) => t.id !== 0n && t.closed_date !== null).map((t) => ({ id: t.id, closed_date: t.closed_date as Date }))

    // Tasks to create are the task
    const userTasksToCreate = taskPool
      .filter((t) => t.id === 0n)
      .map((el) => {
        return {
          task_id: el.task_id,
          user_address: el.user_address,
          start_date: el.start_date,
          closed_date: el.closed_date,
          amount: el.amount.toString(),
        }
      })

    await this.userPointsRepository.updateProcessedTasks(userTasksToClose, userTasksToCreate)
  }

  computeUserPoints = async (startBlock: number, endBlock: number, blockDates: Map<number, number>) => {
    console.log(blockDates.get(startBlock)!, blockDates.get(endBlock)!)
    await this.userPointsRepository.computeUserPoints(blockDates.get(startBlock)!, blockDates.get(endBlock)!)
  }

  insertEvents = async (transferEvents: Prisma.transfer_eventsCreateManyInput[], addLiquidityEvents: Prisma.add_liquidity_eventsCreateManyInput[]) => {
    await this.userPointsRepository.insertTransfers(transferEvents)
    await this.userPointsRepository.insertAddLiquidity(addLiquidityEvents)
  }

  replaceDates<T extends { block_date: string | Date; block_id: number }>(events: T[], blockInfos: Map<number, number>): T[] {
    events.forEach((event) => {
      ; (event as any).block_date = new Date(blockInfos.get(event.block_id)! * 1_000)
    })
    return events as Array<T>
  }

  getERC20ToTrack = async () => {
    return await this.erc20Repository.getERC20ToTrack()
  }

  sortPointsActionsLogs = (logs: Log[]) => {
    const transferEvents: Prisma.transfer_eventsCreateManyInput[] = []
    const uniqueBlockId: Set<number> = new Set()

    logs.forEach((log) => {
      const logSignature = log.topics[0]
      if (![TRANSFER_TOPICS.AddLiquidity, TRANSFER_TOPICS.AddLiquidity2].includes(logSignature)) {
        let transferEvent: Prisma.transfer_eventsUncheckedCreateInput
        switch (logSignature) {
          case TRANSFER_TOPICS.Staked:
            transferEvent = parseStakeConvexEvent(log)
            break
          case TRANSFER_TOPICS.Withdrawn:
            transferEvent = parseWithdrawConvexEvent(log)
            break

          default:
            transferEvent = parseTransferEvent(log)
            break
        }
        if (transferEvent.amount !== "0") {
          transferEvents.push(transferEvent)
          uniqueBlockId.add(log.blockNumber)
        }
      }
    })

    return { transferEvents, pointsEventsBlockIds: Array.from(uniqueBlockId) }
  }

  parseAddLiquidity(logs: Log[], usgLpKeys: Prisma.usg_lp_keysCreateManyInput[]) {
    const uniqueBlockId: Set<number> = new Set()
    const addLiquidityEvents: Prisma.add_liquidity_eventsCreateManyInput[] = []

    logs.forEach((log, i) => {
      const logTopic = log.topics[0]
      if ([TRANSFER_TOPICS.AddLiquidity, TRANSFER_TOPICS.AddLiquidity2].includes(logTopic)) {
        // The transfer event containing the minted amount of LP is always just before the AddLiquidity event
        // We can so retrieve it this way
        const mintEvent = parseTransferEvent(logs[i - 1])
        // Find the ID of the USG lp to link

        const usgKey = usgLpKeys.find((usgLp) => usgLp.lp_address?.toLowerCase() === log.address.toLowerCase())

        if (usgKey) {
          const lpId = BigInt(usgKey?.id!)

          if (TRANSFER_TOPICS.AddLiquidity === logTopic) {
            addLiquidityEvents.push(parseAddLiquidity(log, lpId, mintEvent.amount))
          } else if (TRANSFER_TOPICS.AddLiquidity2 === logTopic) {
            addLiquidityEvents.push(parseAddLiquidity2(log, lpId, mintEvent.amount))
          }
          uniqueBlockId.add(log.blockNumber)
        }
      }
    })
    return { addLiquidityEvents, addLiquEventsBlockIds: Array.from(uniqueBlockId) }
  }

  async recomposeDebtTransferEvents(
    users: { user: string; marketId: number | bigint }[],
    debtSharesCheckpoints: DebtSharesCheckpointStruct
  ): Promise<Prisma.transfer_eventsCreateManyInput[]> {
    const debtTransfers: Prisma.transfer_eventsCreateManyInput[] = []
    const currentDebts = await this.activeBorrowersRepository.getActiveBorrowersMatchingUserMarkets(users)
    const zeroAddress = ZeroAddress.toLowerCase()

    Object.entries(debtSharesCheckpoints).forEach(([marketAddress, userData]) => {
      Object.entries(userData).forEach(([userAddress, checkpoints]) => {
        const currentDebt = currentDebts.find((debt) => debt.market.contract_address === marketAddress && debt.borrower_address === userAddress)
        const currentAmount = currentDebt?.debt_shares ? BigInt(currentDebt.debt_shares) : 0n
        checkpoints.forEach((checkpoint) => {
          let diff = 0n
          if (checkpoint.isRepay) {
            diff = currentAmount - checkpoint.amount
            debtTransfers.push({
              from: userAddress,
              to: zeroAddress,
              amount: diff.toString(),
              block_date: new Date(),
              block_id: checkpoint.blockId,
              token_address: marketAddress,
              tx_hash: checkpoint.txHash,
            })
          } else {
            diff = checkpoint.amount - currentAmount
            debtTransfers.push({
              from: zeroAddress,
              to: userAddress,
              amount: diff.toString(),
              block_date: new Date(),
              block_id: checkpoint.blockId,
              token_address: marketAddress,
              tx_hash: checkpoint.txHash,
            })
          }
        })
      })
    })

    return debtTransfers
  }
}
