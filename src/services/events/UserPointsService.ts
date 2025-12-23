import { Prisma } from "@prisma/client"
import { Log, ZeroAddress } from "ethers"

import { UserPointsLPRepository } from "../../db/Points/UserPointsLPRepository.js"
import { ERC20Repository } from "../../db/ERC20Repository.js"

import { parseAddLiquidity, parseStakeConvexEvent, parseTransferEvent, parseWithdrawConvexEvent } from "../../eventFectcher/marketUserEvents.parsers.js"
import { BlockService } from "../BlockService.js"
import { TRANSFER_TOPICS } from "../../eventFectcher/erc20TransferEventFetcher.js"
import { DebtSharesCheckpointStruct } from "./UserMarketService.js"
import { ActiveBorrowersRepository } from "src/db/ActiveBorrowersRepository.js"

export type SortedEvents = {
  Transfer: Prisma.transfer_eventsCreateManyInput[]
}

type LpUserTaskPoolItem = {
  id: bigint
  task_id: bigint
  user_address: string
  start: Date
  amount: string
  closed: Date | null
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

  // Helper to create and track new tasks in-memory
  createAndTrack = (
    userAddress: string,
    taskId: bigint,
    start: Date,
    amount: string,
    createdIndexByKey: Map<string, number>,
    taskPool: LpUserTaskPoolItem[],
    openTaskMap: Map<
      string,
      {
        id: bigint
        task_id: bigint
        user_address: string
        start: Date
        amount: string
        closed: Date | null
      }
    >
  ) => {
    const newTask: LpUserTaskPoolItem = {
      id: 0n, // synthetic
      task_id: taskId,
      user_address: userAddress,
      start,
      amount,
      closed: null,
    }

    const idx = taskPool.push(newTask) - 1
    createdIndexByKey.set(`${userAddress}_${taskId}_${start.getTime()}`, idx)

    openTaskMap.set(`${userAddress}_${taskId}`, newTask)
  }

  async updateLPUserTasks(startBlock: number, endBlock: number) {
    // Retrieve transfer events
    const { tasks, transferEvents } = await this.userPointsRepository.fetchTasksEventsAndAddresses(startBlock, endBlock)
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

    toExclude.forEach((u) => {
      if (allUserAddresses.has(u)) {
        allUserAddresses.delete(u)
      }
    })
    const openUserTasks = await this.userPointsRepository.getOpenedTasks(
      Array.from(allUserAddresses),
      tasks.map((task) => task.id)
    )

    const taskPool: LpUserTaskPoolItem[] = []

    // Add all open tasks from DB to taskPool
    for (const openUserTask of openUserTasks) {
      taskPool.push(openUserTask as LpUserTaskPoolItem)
    }

    for (const event of transferEvents) {
      const task = tasks.find((t) => t.token.address.toLowerCase() === event.token_address?.toLowerCase())

      if (!task) {
        console.warn(`No matching task for token ${event.token_address}, skipping`)
        break
      }

      for (const userAddressRaw of [event.from, event.to]) {
        const userAddress = userAddressRaw.toLowerCase()
        if (!toExclude.includes(userAddress)) {
          const isSender = userAddress === event.from?.toLowerCase()

          // Find open task in taskPool
          const openTask = taskPool.find((t) => t.user_address.toLowerCase() === userAddress && t.task_id === task.id && t.closed === null)

          if (!openTask) {
            taskPool.push({
              id: 0n, // synthetic
              task_id: task.id,
              user_address: userAddress,
              start: event.block_date,
              amount: event.amount,
              closed: null,
            })
          }

          if (openTask) {
            const closedAt = new Date(event.block_date)
            // Close the existing task
            openTask.closed = closedAt

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
                start: event.block_date,
                amount: newAmount.toString(),
                closed: null,
              })
            }
          }
        }
      }
    }
    // const taskToclose= openTaskMap.values().filter((t) => t.closed !== null && id!==Bigint(0))
    // const tasksToCreate= openTaskMap.values().filter((t) => id===Bigint(0))

    const tasksToClose = taskPool.filter((t) => t.id !== 0n && t.closed !== null).map((t) => ({ id: t.id, closed: t.closed as Date }))

    // Remove "ids=0n" for prisma not to push them
    const tasksToCreate = taskPool
      .filter((t) => t.id === 0n)
      .map((el) => {
        return {
          task_id: el.task_id,
          user_address: el.user_address,
          start: el.start,
          closed: el.closed,
          amount: el.amount.toString(),
        }
      })

    await this.userPointsRepository.updateProcessedTasks(tasksToClose, tasksToCreate)
  }

  processUserPoints = async (startBlock: number, endBlock: number, blockService: BlockService, providerURL: string) => {
    const blockDates = await blockService.fetchBlockTimestamps([startBlock, endBlock], providerURL)
    await this.userPointsRepository.computeUserPoints(blockDates.get(startBlock)!, blockDates.get(endBlock)!)
  }

  async getUsgLpKeys(): Promise<Prisma.usg_lp_keysCreateManyInput[]> {
    return await this.userPointsRepository.getUsgLps()
  }

  insertEvents = async (transferEvents: Prisma.transfer_eventsCreateManyInput[], addLiquidityEvents: Prisma.add_liquidity_eventsCreateManyInput[]) => {
    await this.userPointsRepository.insertTransfers(transferEvents)
    await this.userPointsRepository.insertAddLiquidity(addLiquidityEvents)
  }

  replaceDates<T extends { block_date: string | Date; block_id: number }>(events: T[], blockInfos: Map<number, number>): T[] {
    events.forEach((event) => {
      ;(event as any).block_date = new Date(blockInfos.get(event.block_id)! * 1_000)
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
      if (logSignature !== TRANSFER_TOPICS.AddLiquidity) {
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
        transferEvents.push(transferEvent)
        uniqueBlockId.add(log.blockNumber)
      }
    })

    return { transferEvents, pointsEventsBlockIds: Array.from(uniqueBlockId) }
  }

  parseAddLiquidity(logs: Log[], usgLpKeys: Prisma.usg_lp_keysCreateManyInput[]) {
    const uniqueBlockId: Set<number> = new Set()
    const addLiquidityEvents: Prisma.add_liquidity_eventsCreateManyInput[] = []

    logs.forEach((log, i) => {
      if (log.topics[0] === TRANSFER_TOPICS.AddLiquidity) {
        // The transfer event containing the minted amount of LP is always just before the AddLiquidity event
        // We can so retrieve it this way
        const mintEvent = parseTransferEvent(logs[i - 1])

        // Find the ID of the USG lp to link
        const lpId = BigInt(usgLpKeys.find((usgLp) => usgLp.lp_address === log.address.toLowerCase())!.id!)
        addLiquidityEvents.push(parseAddLiquidity(log, lpId, mintEvent.amount))
        uniqueBlockId.add(log.blockNumber)
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
