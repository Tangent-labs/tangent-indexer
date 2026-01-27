import { Prisma } from "@prisma/client"
import { AbstractRepository } from "./AbstractRepository.js"

export type GetAccountedBalances = {
  id: bigint
  usg_lp_id: bigint
  usg_lp: {
    lp_name: string
  }
  user_address: string
  balance_lp: string
}
export type AccountedTotal = {
  id: bigint
  usg_lp_id: bigint
  total_lp: string
  cap_lp: string
  usg_lp: {
    lp_name: string
  }
}
export class PredepositCampaignRepository extends AbstractRepository {
  /* =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-=
                      BLOCK
  =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-= */
  /**
   * @notice  Fetch the last block indexed by the predeposit script
   * @returns A block ID or null if its the first iteration
   */
  async getLastPredepositCampaignBlock() {
    return await this.prismaClient.predeposit_block.findFirst({
      orderBy: {
        block_id: "desc",
      },
    })
  }

  /**
   * @notice  Insert the last block that have been checkpointed for the predeposit campaign
   * @param   blockId The block to register
   * @returns 'deposit_private' or 'deposit_public' or 'retention' or 'finished'
   */
  async storePredepositCampaignBlock(blockId: number) {
    await this.prismaClient.predeposit_block.create({
      data: {
        block_id: blockId,
      },
    })
  }

  /* =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-=
                    GETTERS
   =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-= */

  /**
   * @notice  Fetch the current state of the predeposit campaign
   * @returns 'deposit_private' or 'deposit_public' or 'retention' or 'finished'
   */
  async getPredepositState() {
    return await this.prismaClient.predeposit_state.findFirst()
  }

  /**
   * @notice Fetch AddLiquidity events from the database within a given block range.
   * @param startBlock   - The starting block (exclusive).
   * @param endBlock     - The ending block (inclusive).
   * @param usersToKeep  - List of provider addresses to filter the events.
   * @returns A list of filtered AddLiquidity events.
   */
  async getAddLiquidityEventsInBlockRange(startBlock: number, endBlock: number, usersToKeep: string[]) {
    return await this.prismaClient.add_liquidity_events.findMany({
      where: {
        block_id: { gte: startBlock, lte: endBlock },
        provider: {
          in: usersToKeep,
        },
      },
    })
  }

  /**
   * @notice  Fetch accounted balances for a LP and a list of user
   * @param   lpId  ID of the LP linked to the balance
   * @param   users Addresses of the users we want to include
   * @returns A list of acounted balances filtered by lpId and user addresses
   */
  async getAccountedBalancesForUsersOnLP(lpId: number, users: string[]) {
    return await this.prismaClient.accounted_balances.findMany({
      where: {
        usg_lp_id: {
          equals: lpId,
        },
        user_address: {
          in: users,
        },
      },
    })
  }

  /**
   * @notice  Fetch all accounted balances
   * @returns A list of acounted balances
   */
  async getAllAccountedBalances(): Promise<GetAccountedBalances[]> {
    return await this.prismaClient.accounted_balances.findMany({
      select: {
        id: true,
        usg_lp_id: true,
        balance_lp: true,
        user_address: true,
        usg_lp: {
          select: {
            lp_name: true,
          },
        },
      },
    })
  }

  /**
   * @notice  Fetch all accounted total on the LP
   * @returns A list of all accounted total for each LP with cap and current state
   */
  async getAccountedTotal() {
    return await this.prismaClient.accounted_total.findMany({
      select: {
        usg_lp: {
          select: {
            lp_name: true,
          },
        },
        id: true,
        cap_lp: true,
        total_lp: true,
        usg_lp_id: true,
      },
      orderBy: {
        id: "asc",
      },
    })
  }

  /**
   * @notice  Fetch users that are in the private_deposit phase + signed the predeposit message
   * @returns A list of users
   */
  async getPrivateUsers() {
    return await this.prismaClient.predeposit_users.findMany({
      select: {
        user_address: true,
      },
      where: {
        is_private: true,
        signature: {
          not: null,
        },
      },
    })
  }

  /**
   * @notice  Fetch all users that have signed the predeposit message
   * @returns A list of users
   */
  async getAllUsers() {
    return await this.prismaClient.predeposit_users.findMany({
      select: {
        user_address: true,
      },
      where: {
        signature: {
          not: null,
        },
      },
    })
  }

  /* =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-=
                ACCOUNTED BALANCE MANAGEMENT
   =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-= */

  async insertAccountedBalances(data: Prisma.accounted_balancesCreateManyInput[]) {
    if (data.length) {
      await this.prismaClient.accounted_balances.createMany({
        data,
      })
    }
  }

  async deleteAccountedBalances(ids: bigint[]) {
    if (ids.length) {
      await this.prismaClient.accounted_balances.deleteMany({
        where: {
          id: {
            in: ids,
          },
        },
      })
    }
  }

  async insertAccountedBalancesHistory(data: Prisma.accounted_balancesCreateManyInput[], now: Date) {
    if (data.length > 0) {
      await this.prismaClient.accounted_balances_history.createMany({
        data: data.map((accBal) => {
          // We want to regenerate an ID
          const { id, ...rest } = accBal
          return { ...rest, date: now }
        }),
      })
    }
  }

  /* =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-=
              ACCOUNTED TOTAL MANAGEMENT
 =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-= */

  async insertAccountedTotal(data: Prisma.accounted_totalCreateManyInput[]) {
    if (data.length > 0) {
      await this.prismaClient.accounted_total.createMany({
        data,
      })
    }
  }

  async deleteAccountedTotal(ids: bigint[]) {
    if (ids.length > 0) {
      await this.prismaClient.accounted_total.deleteMany({
        where: {
          id: {
            in: ids,
          },
        },
      })
    }
  }

  async insertAccountedTotalHistory(data: Prisma.accounted_totalCreateManyInput[], now: Date) {
    if (data.length > 0) {
      await this.prismaClient.accounted_total_history.createMany({
        data: data.map((accTotal) => {
          // We want to regenerate an ID
          const { id, ...rest } = accTotal
          return { ...rest, date: now }
        }),
      })
    }
  }
}
