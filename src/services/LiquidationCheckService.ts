import fs from "fs"

import MarketAccountLiquidationBotInfoAbi from "../abis/MarketAccountLiquidationBotInfo.json" with { type: "json" }

import { AddressLike, JsonRpcProvider } from "ethers"
import { ActiveBorrowersRepository } from "../db/ActiveBorrowersRepository.js"

import {
  LiquidationAccountOutInfo,
  LiquidationAnalyseInfo,
  LiquidationMarketAccountOutInfo,
  LiquidationMarketOutInfo,
  LiquidationUserFullInfo,
  LiquidationUserInInfo,
} from "../type/data.js"
import { chainView } from "../utils/chainView.js"
import { LiquidationExecutionContext } from "./LiquidationExecutionContext.js"
import { indexerConfig } from "../config/indexer_config.js"

const DENOMINATOR = 100_000n

type WithToObject<T> = T & {
  toObject: () => T
}

export class LiquidationCheckService {
  activeBorrowersRepository: ActiveBorrowersRepository
  context: LiquidationExecutionContext
  marketBorrowerFilePath: string = `${indexerConfig.sharedDataDir}/market_borrowers.json`

  constructor(activeBorrowersRepository: ActiveBorrowersRepository, context: LiquidationExecutionContext) {
    this.activeBorrowersRepository = activeBorrowersRepository
    this.context = context
  }

  async getLiquidationParams(): Promise<{ markets: AddressLike[]; borrowers: LiquidationUserInInfo[] }> {
    if (this.context.isDbAlive) {
      const data = await this.getLiquidationParamsFromDb()
      return data
    } else {
      const data = await this.getLiquidationParamsFromFile()
      return data
    }
  }

  async getLiquidationParamsFromFile(): Promise<{ markets: AddressLike[]; borrowers: LiquidationUserInInfo[] }> {
    // Read the file synchronously (you can also use async methods)
    const data = fs.readFileSync(this.marketBorrowerFilePath, "utf-8")

    // Parse the JSON content
    const parsedData = JSON.parse(data)

    // Return the expected structure
    return {
      markets: parsedData.markets, // Assuming the markets field is an array of AddressLike
      borrowers: parsedData.borrowers, // Assuming borrowers field is an array of LiquidationUserInInfo
    }
  }

  /**
   * Retrieves the parameters required for liquidation.
   * @returns An object containing the markets and borrowers to be liquidated.
   */
  async getLiquidationParamsFromDb(): Promise<{ markets: AddressLike[]; borrowers: LiquidationUserInInfo[] }> {
    if (this.context.isDbAlive) {
      const borrowersRawList = await this.activeBorrowersRepository.getAll()

      const markets = new Set<AddressLike>()
      const borrowers = borrowersRawList.map((borrower) => {
        markets.add(borrower.market.contract_address as AddressLike)
        return {
          account: borrower.borrower_address as AddressLike,
          market: borrower.market.contract_address as AddressLike,
        }
      })
      return { markets: Array.from(markets), borrowers }
    } else {
      const data = fs.readFileSync(this.marketBorrowerFilePath, "utf-8")
      return JSON.parse(data)
    }
  }

  /**
   * Retrieves on-chain data for liquidation analysis.
   * @param provider The JSON RPC provider.
   * @param markets The markets to be analyzed.
   * @param borrowers The borrowers to be analyzed.
   * @returns LiquidationMarketAccountOutInfo or undefined.
   */
  async getOnchainData(
    providers: JsonRpcProvider[],
    markets: AddressLike[],
    borrowers: LiquidationUserInInfo[],
    marketViewerAddress: string
  ): Promise<LiquidationMarketAccountOutInfo | undefined> {
    // get the data from the  all the providers
    const calls = providers.map((provider, index) =>
      chainView<[AddressLike[], LiquidationUserInInfo[], string], [LiquidationMarketAccountOutInfo]>(
        provider,
        MarketAccountLiquidationBotInfoAbi.abi,
        MarketAccountLiquidationBotInfoAbi.bytecode,
        [markets, borrowers, marketViewerAddress]
      )
    )

    // Don't let a single failing RPC interrupt the whole process.
    // We keep successful results and log failures for observability.
    const results = await Promise.allSettled(calls)
    const datas = results.map((result, callIndex) => {
      if (result.status !== "fulfilled") {
        const message = (result.reason as Error | undefined)?.message ?? String(result.reason)
        console.warn(`⚠️ getOnchainData: provider call failed (rpcIndex=${callIndex}): ${message}`)
        return undefined
      }

      const d = result.value?.at(0)
      if (!d) return undefined

      return {
        markets: d.markets.map((m) => (m as unknown as WithToObject<LiquidationMarketOutInfo>).toObject()),
        accounts: d.accounts.map((a, index) => ({ ...(a as unknown as WithToObject<LiquidationAccountOutInfo>).toObject(), callIndex, index })),
        blockNumber: d.blockNumber,
        blockTimestamp: d.blockTimestamp,
      }
    })

    // remove duplicates in markets
    const marketsResult = datas
      .map((d) => d?.markets || [])
      .flat()
      .filter((m, index, self) => self.findIndex((t) => t.market === m.market) === index)

    // remove duplicates in accounts and keep the one with the highest healthRatio
    const finalAccounts = []
    const accountLength = datas.find((d) => (d?.accounts?.length || 0) > 0)?.accounts?.length || 0
    const accountsFlat = datas.map((d) => d?.accounts || []).flat()

    if (accountLength !== borrowers.length) {
      const errorMessage = `CRITICAL: Account length mismatch in getOnchainData! Expected ${borrowers.length} accounts (from borrowers), but got ${accountLength} from on-chain data. This indicates a data integrity issue.`
      console.error(`❌ ${errorMessage}`)
      return undefined
    }

    for (let i = 0; i < accountLength; i++) {
      const results = accountsFlat.filter((a) => a.index === i)
      const minHealthRatio = results.reduce<bigint | undefined>((acc, curr) => (acc && acc < curr.healthRatio ? acc : curr.healthRatio), undefined)

      const row = results.find((a) => a.healthRatio === minHealthRatio)
      if (row) {
        finalAccounts.push(row)
      }
    }

    const finalAccountsResult = finalAccounts.filter((a) => a !== undefined)

    if (finalAccountsResult.length !== borrowers.length) {
      const errorMessage = `CRITICAL: Final accounts count (${finalAccountsResult.length}) doesn't match borrowers count (${borrowers.length}) in getOnchainData. This indicates missing accounts from all provider responses.`
      console.error(`❌ ${errorMessage}`)
      return undefined
    }

    const validDatas = datas.filter((d) => d !== undefined)
    const blockNumber = validDatas.reduce<bigint>((max, d) => (d.blockNumber > max ? d.blockNumber : max), 0n)
    const blockTimestamp = validDatas.find((d) => d.blockNumber === blockNumber)?.blockTimestamp ?? 0n

    return { markets: marketsResult, accounts: finalAccountsResult as LiquidationAccountOutInfo[], blockNumber, blockTimestamp }
  }

  /**
   * Analyzes liquidation opportunities.
   * @param datas The liquidation market account out info.
   * @param markets The markets to be analyzed.
   * @param accounts The accounts to be analyzed.
   * @returns LiquidationAnalyseInfo.
   */
  async analyzeLiquidation(datas: LiquidationMarketAccountOutInfo, accounts: LiquidationUserInInfo[]): Promise<LiquidationAnalyseInfo> {
    if (datas.accounts.length !== accounts.length) {
      const errorMessage = `CRITICAL: accounts length mismatch in analyzeLiquidation! On-chain: ${datas.accounts.length}, Borrowers: ${accounts.length}. This indicates a data integrity issue.`
      console.error(`❌ ${errorMessage}`)
      throw new Error(errorMessage)
    }

    let hydratedAccounts = datas.accounts.map((accountData, index) => {
      const account = accounts[index]
      const market = datas.markets.find((m) => (m.market as string).toLowerCase() === (accountData.market as string).toLowerCase())
      return {
        ...accountData,
        ...account,
        ...market,
        ltv: accountData.positionValue === 0n ? 0n : (accountData.userDebt * DENOMINATOR) / accountData.positionValue,
      }
    })

    hydratedAccounts = hydratedAccounts.filter((a) => a.userDebt > 0n)

    let seizingList: LiquidationUserFullInfo[] = [] // borrower with positionvalue < debt
    let liquidationList: LiquidationUserFullInfo[] = [] // borrower with ltv > liquidationThreshold

    // We detect the potential actions we have to do
    hydratedAccounts.forEach((account) => {
      if (account.userDebt >= account.positionValue) {
        seizingList.push(account as LiquidationUserFullInfo)
        return
      }
      if (account.ltv > account.liquidationThreshold!) {
        liquidationList.push(account as LiquidationUserFullInfo)
      }
    })

    const sortFn: (a: LiquidationUserFullInfo, b: LiquidationUserFullInfo) => number = (a, b) => Number(b.positionValue) - Number(a.positionValue)

    seizingList = seizingList.sort(sortFn)
    liquidationList = liquidationList.sort(sortFn)

    return { seizingList, liquidationList }
  }

  /**
   * Prioritizes the liquidation actions by combining seizing and liquidation lists,
   * then sorting them by position value in descending order.
   *
   * Prioritization strategy:
   * - Seizing actions (bad debt) are combined with liquidation actions
   * - All actions are sorted by positionValue (highest first) to prioritize larger positions
   * - This ensures the most valuable liquidations are processed first
   * - All actions are returned (not limited by wallet count) as they will be distributed
   *   across available wallets in round-robin fashion by the caller
   *
   * @param seizingList The list of seizing actions (bad debt cases where debt >= position value)
   * @param liquidationList The list of liquidation actions (cases where LTV > liquidation threshold)
   * @returns The prioritized liquidation actions sorted by position value (descending)
   */
  prioritizeActions(
    seizingList: LiquidationUserFullInfo[],
    liquidationList: LiquidationUserFullInfo[]
  ): (LiquidationUserFullInfo & { type: "seizing" | "liquidation" })[] {
    // Combine both action types with their type indicator
    const actionsList = [
      ...seizingList.map((a) => ({ ...a, type: "seizing" as const })),
      ...liquidationList.map((b) => ({ ...b, type: "liquidation" as const })),
    ]
    // Sort by position value in descending order (highest value first)
    const sortedActionsList = actionsList.sort((a, b) => Number(b.positionValue) - Number(a.positionValue))

    // Return all actions, not limited by wallet count
    // The caller will distribute these across wallets in round-robin fashion
    return sortedActionsList || []
  }

  /**
   * Save the files to the database
   * @param data The markets and borrowers to be saved.
   */
  saveFiles(data: { markets: AddressLike[]; borrowers: LiquidationUserInInfo[] }) {
    fs.mkdirSync(indexerConfig.sharedDataDir, { recursive: true })
    fs.writeFileSync(this.marketBorrowerFilePath, JSON.stringify(data, null, 2))
  }
}
