import fs from "fs"

import MarketExternalActionsAbi from "../abis/MarketExternalActions.json"
import MarketAccountLiquidationBotInfoAbi from "../abis/MarketAccountLiquidationBotInfo.json"
import QuoteLiquidationRouterAbi from "../abis/QuoteLiquidationRouter.json"
import successRoutes from "../SuccessRoutes.json"

import { AddressLike, Contract, JsonRpcProvider, Wallet, ZeroAddress } from "ethers"
import { MarketBorrowerRepository } from "../db/MarketBorrowerRepository"

import {
  LiquidationAccountOutInfo,
  LiquidationAnalyseInfo,
  LiquidationMarketAccountOutInfo,
  LiquidationMarketOutInfo,
  LiquidationUserFullInfo,
  LiquidationUserInfo,
  LiquidationUserInInfo,
  QuoteLiquidationRouterIn,
} from "../type/data"
import { chainView } from "../utils/chainView"
import { LiquidationExecutionContext } from "./LiquidationExecutionContext"
import { BlockRepository } from "../db/BlockRepository"

const DENOMINATOR = 100_000n

type WithToObject<T> = T & {
  toObject: () => T
}

export class LiquidationService {
  marketBorrowerRepository: MarketBorrowerRepository
  context: LiquidationExecutionContext
  marketBorrowerFilePath: string = "./src/data/market_borrowers.json"

  async checkContext() {
    const blockRepository = new BlockRepository(null!)
    blockRepository.setClient(this.marketBorrowerRepository.prismaClient)

    // try the database connectivty
    try {
      await blockRepository.getLastBlockIndexed()
    } catch (error) {
      this.context.isDbAlive = false
    }
    this.context.isDbAlive = false
    // TODO : check the RPCs , and set the rpcIndex on context
  }

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
  async analyzeLiquidation(datas: LiquidationMarketAccountOutInfo, accounts: LiquidationUserInInfo[]): Promise<LiquidationAnalyseInfo> {
    const hydratedAccounts = datas.accounts.map((accountData, index) => {
      const account = accounts[index]
      const market = datas.markets.find((m) => (m.market as string).toLowerCase() === (accountData.market as string).toLowerCase())
      return {
        ...accountData,
        ...account,
        ...market,
        ltv: accountData.positionValue === 0n ? 0n : (accountData.positionDebt * DENOMINATOR) / accountData.positionValue,
      }
    })

    const notDebtorAnymoreList: LiquidationUserInfo[] = [] // borrower with 0 debt
    let hardLiquidationList: LiquidationUserInfo[] = [] // borrower with positionvalue > debt
    let softLiquidationList: LiquidationUserFullInfo[] = [] // borrower with healthRatio >=1

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
      if (account.ltv > account.liquidationThreshold!) {
        softLiquidationList.push(account as LiquidationUserFullInfo)
      }
    })

    const sortFn: (a: LiquidationUserInfo | LiquidationUserFullInfo, b: LiquidationUserInfo | LiquidationUserFullInfo) => number = (a, b) =>
      Number(b.positionValue) - Number(a.positionValue)

    hardLiquidationList = hardLiquidationList.sort(sortFn)
    softLiquidationList = softLiquidationList.sort(sortFn)

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
  async processSoftLiquidations(provider: JsonRpcProvider, accounts: LiquidationUserFullInfo[]) {
    // console.log(accounts)
    for (const account of accounts) {
      const route = await this._getBestRoute(provider, account)
      if (route) {
        console.log(route)
      } else {
        console.log("No route found")
      }
    }
  }

  async _getBestRoute(provider: JsonRpcProvider, account: LiquidationUserFullInfo) {
    const matchingROutes = successRoutes.filter((route) => route.start.toLowerCase() === (account.collatToken as string).toLowerCase())
    if (!matchingROutes.length) {
      return null
    }

    const routeParams = matchingROutes.map((route) => ({
      curveQuote: {
        _route: route.params.routeAddresses,
        _swap_params: route.params.swapParams,
        _amount: account.positionValue,
        _pools: [ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress],
      },
      wStableQuote: {
        stablePools: ZeroAddress,
        i: 0,
        j: 1,
      },
    }))

    const routesCheck = await chainView<[QuoteLiquidationRouterIn[]], [any]>(provider, QuoteLiquidationRouterAbi.abi, QuoteLiquidationRouterAbi.bytecode, [
      routeParams,
    ])
    console.log(routesCheck)
  }

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

  /**
   * Save the files to the database
   * @param data The markets and borrowers to be saved.
   */
  saveFiles(data: { markets: AddressLike[]; borrowers: LiquidationUserInInfo[] }) {
    fs.writeFileSync(this.marketBorrowerFilePath, JSON.stringify(data, null, 2))
  }
}
