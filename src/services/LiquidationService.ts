/**
 * This service is responsible for handling liquidations of market borrowers.
 */
import fs from "fs"
import path from "path"

import MarketExternalActionsAbi from "../abis/MarketExternalActions.json"
import MarketAccountLiquidationBotInfoAbi from "../abis/MarketAccountLiquidationBotInfo.json"

import { AddressLike, Contract, JsonRpcProvider, Wallet } from "ethers"
import { MarketBorrowerRepository } from "../db/MarketBorrowerRepository"

import {
  LiquidationAccountOutInfo,
  LiquidationAnalyseInfo,
  LiquidationMarketAccountOutInfo,
  LiquidationMarketOutInfo,
  LiquidationUserInfo,
  LiquidationUserInInfo,
} from "../type/data"
import { chainView } from "../utils/chainView"
import { LiquidationExecutionContext } from "./LiquidationExecutionContext"

const DENOMINATOR = 100_000n

type WithToObject<T> = T & {
  toObject: () => T
}

export class LiquidationService {
  marketBorrowerRepository: MarketBorrowerRepository
  context: LiquidationExecutionContext

  constructor(marketBorrowerRepository: MarketBorrowerRepository, context: LiquidationExecutionContext) {
    this.marketBorrowerRepository = marketBorrowerRepository
    this.context = context
  }

  async getLiquidationParams(): Promise<{ markets: AddressLike[]; borrowers: LiquidationUserInInfo[] }> {
    try {
      if (this.context.isDbAlive) {
        const data = await this.getLiquidationParamsFromDb()
        return data
      } else {
        const data = await this.getLiquidationParamsFromFile()
        return data
      }
    } catch (error) {
      console.error("Failed to get liquidation params:", error)
      return { markets: [], borrowers: [] } // Return an empty array if the data cannot be retrieved
    }
  }

  async getLiquidationParamsFromFile(): Promise<{ markets: AddressLike[]; borrowers: LiquidationUserInInfo[] }> {
    // Read the file synchronously (you can also use async methods)
    // eslint-disable-next-line no-undef
    const filePath = path.resolve(__dirname!, "./src/data/borrowers.json")
    const data = fs.readFileSync(filePath, "utf-8")

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
    const borrowersRawList = await this.marketBorrowerRepository.getList()

    const markets = new Set<AddressLike>()
    const borrowers = borrowersRawList.map((borrower) => {
      markets.add(borrower.contract_address as AddressLike)
      return {
        account: borrower.borrower_address as AddressLike,
        market: borrower.contract_address as AddressLike,
      }
    })
    return { markets: Array.from(markets), borrowers }
  }

  /**
   * Retrieves on-chain data for liquidation analysis.
   * @param provider The JSON RPC provider.
   * @param markets The markets to be analyzed.
   * @param borrowers The borrowers to be analyzed.
   * @returns LiquidationMarketAccountOutInfo or undefined.
   */
  async getOnchainData(
    provider: JsonRpcProvider,
    markets: AddressLike[],
    borrowers: LiquidationUserInInfo[]
  ): Promise<LiquidationMarketAccountOutInfo | undefined> {
    const userAccountsData = await chainView<[AddressLike[], LiquidationUserInInfo[]], [LiquidationMarketAccountOutInfo]>(
      provider,
      MarketAccountLiquidationBotInfoAbi.abi,
      MarketAccountLiquidationBotInfoAbi.bytecode,
      [markets, borrowers]
    )
    const d = userAccountsData?.at(0)
    if (d) {
      return {
        markets: d.markets.map((m) => (m as unknown as WithToObject<LiquidationMarketOutInfo>).toObject()),
        accounts: d.accounts.map((a) => (a as unknown as WithToObject<LiquidationAccountOutInfo>).toObject()),
      } as LiquidationMarketAccountOutInfo
    }
  }

  /**
   * Analyzes liquidation opportunities.
   * @param datas The liquidation market account out info.
   * @param markets The markets to be analyzed.
   * @param accounts The accounts to be analyzed.
   * @returns LiquidationAnalyseInfo.
   */
  async analyzeLiquidation(datas: LiquidationMarketAccountOutInfo, markets: AddressLike[], accounts: LiquidationUserInInfo[]): Promise<LiquidationAnalyseInfo> {
    const hydratedAccounts = datas.accounts.map((accountData, index) => ({
      ...accountData,
      ...accounts[index],
      ltv: accountData.positionValue === 0n ? 0n : (accountData.positionDebt * DENOMINATOR) / accountData.positionValue,
    }))

    // get the liquidation threshold for each market
    const thresholds = datas.markets.reduce<Record<string, bigint>>((agg, market, index) => {
      agg[markets[index] as string] = market.liquidationThreshold
      return agg
    }, {})

    const notDebtorAnymoreList: LiquidationUserInfo[] = [] // borrower with 0 debt
    let hardLiquidationList: LiquidationUserInfo[] = [] // borrower with positionvalue > debt
    let softLiquidationList: LiquidationUserInfo[] = [] // borrower with healthRatio >=1

    // We detect the potential actions we have to do
    hydratedAccounts.forEach((account) => {
      if (account.positionDebt === 0n) {
        notDebtorAnymoreList.push(account)
        return
      }

      if (account.positionDebt >= account.positionValue) {
        hardLiquidationList.push(account)

        return
      }

      if (account.ltv > thresholds[account.market as string]) {
        softLiquidationList.push(account)
      }
    })

    const sortFn: (a: LiquidationUserInfo, b: LiquidationUserInfo) => number = (a, b) => Number(b.positionValue) - Number(a.positionValue)

    hardLiquidationList = hardLiquidationList.sort(sortFn)
    softLiquidationList = softLiquidationList.sort(sortFn)

    console.log(hydratedAccounts, thresholds)

    return { hardLiquidationList, softLiquidationList, notDebtorAnymoreList }
  }

  /**
   * Processes hard liquidations.
   * @param provider The JSON RPC provider.
   * @param accounts The accounts to be liquidated.
   */
  async processHardLiquidations(provider: JsonRpcProvider, accounts: LiquidationUserInfo[]) {
    // Group accounts by market
    const groupedAccounts = accounts.reduce<Record<string, AddressLike[]>>((agg, account) => {
      agg[account.market as string] = agg[account.market as string] || []
      agg[account.market as string].push(account.account)
      return agg
    }, {})

    // Iterate over each market and perform liquidations
    const signer = new Wallet(process.env.PK_WALLET as string, provider)

    for (const market of Object.keys(groupedAccounts)) {
      const marketContract = new Contract(market, MarketExternalActionsAbi.abi, signer)

      for (const account of groupedAccounts[market]) {
        try {
          const tx = await marketContract.liquidateBadDebt(account)
          console.log(`Liquidation tx for ${account} on ${market}:`, tx.hash)
          await tx.wait() // Wait for the transaction to be mined
        } catch (error) {
          console.error(`Failed to liquidate ${account} on ${market}:`, error)
        }
      }
    }
  }

  /**
   * Processes soft liquidations.
   * @param provider The JSON RPC provider.
   * @param accounts The accounts to be liquidated.
   */
  async processSoftLiquidations(provider: JsonRpcProvider, accounts: LiquidationUserInfo[]) {}

  /**
   * Processes clean debtors.
   * @param accounts The accounts to be cleaned.
   */
  async processCleanDebtors(accounts: LiquidationUserInfo[]) {
    await this.marketBorrowerRepository.deleteMarketBorrowers(
      accounts.map((acc) => ({
        borrower: acc.account as string,
        market: acc.market as string,
      }))
    )
  }
}
