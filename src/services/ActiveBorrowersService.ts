import { ActiveBorrowersRepository } from "../db/ActiveBorrowersRepository"
import { UserAction } from "./events/UserMarketService"

export class ActiveBorrowersService {
  activeBorrowersRepository: ActiveBorrowersRepository
  constructor(activeBorrowersRepository: ActiveBorrowersRepository) {
    this.activeBorrowersRepository = activeBorrowersRepository
  }

  async updateActiveBorrowers(userActions: UserAction[]) {
    // For all UserAction having the same market / user,
    // we keep only the last from the list because it's the only one that is relevant.
    const seen = new Map<string, UserAction>()

    // Going reverse through the array and keep only the first
    for (let i = userActions.length - 1; i >= 0; i--) {
      const item = userActions[i]
      const key = `${item.user}|${item.marketId}`
      if (!seen.has(key)) {
        seen.set(key, item)
      }
    }

    // Then reverse the array and filter only active_borrowers to reinsert
    //    - It's a borrow
    //      OR
    //    - It's not a repayAll
    const userActionsNoDuplicate = Array.from(seen.values())
      .reverse()
      .filter((userAction) => userAction.isBorrow || !userAction.isRepayAll)

    // Delete all user actions matching the market/user keys
    await this.activeBorrowersRepository.deleteActiveBorrowers(userActions)

    // Insert new
    await this.activeBorrowersRepository.insertActiveBorrowers(userActionsNoDuplicate)

    return {
      deleted: userActions,
      inserted: userActionsNoDuplicate,
    }
  }
}
