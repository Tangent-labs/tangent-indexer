import fs from "fs"

import MarketExternalActionsAbi from "../abis/MarketExternalActions.json"
import MarketAccountLiquidationBotInfoAbi from "../abis/MarketAccountLiquidationBotInfo.json"
import ICurveRouterAbi from "../abis/ICurveRouter.json"
import QuoteLiquidationRouterAbi from "../abis/QuoteLiquidationRouter.json"
import successRoutes from "../hydratedRoute.json"

import { Addressable, AddressLike, Contract, Interface, JsonRpcProvider, MaxUint256, Wallet, ZeroAddress } from "ethers"
import { MarketBorrowerRepository } from "../db/MarketBorrowerRepository"

import {
  CurveQuote,
  LiquidationAccountOutInfo,
  LiquidationAnalyseInfo,
  LiquidationMarketAccountOutInfo,
  LiquidationMarketOutInfo,
  LiquidationUserFullInfo,
  LiquidationUserInInfo,
} from "../type/data"
import { chainView } from "../utils/chainView"
import { LiquidationExecutionContext } from "./LiquidationExecutionContext"
import { BlockRepository } from "../db/BlockRepository"

import { indexerConfig } from "../config/indexer_config"
import { LiquidationBotService } from "./LiquidationBotLogService"

const DENOMINATOR = 100_000n

type WithToObject<T> = T & {
  toObject: () => T
}

export class LiquidationService {
  marketBorrowerRepository: MarketBorrowerRepository
  context: LiquidationExecutionContext
  liquidationBotService?: LiquidationBotService
  marketBorrowerFilePath: string = "./src/data/market_borrowers.json"

  async checkContext() {
    const providers = this.context.providers

    const blockRepository = new BlockRepository(null!)
    blockRepository.setClient(this.marketBorrowerRepository.prismaClient)

    // try the database connectivty
    try {
      await blockRepository.getLastBlockIndexed()
    } catch (error) {
      this.context.isDbAlive = true
    }
    // this.context.isDbAlive = false
    // TODO : check the RPCs , and set the rpcIndex on context

    // get the current block from all rpcs, do not throw an error if one fails
    const currentBlocks = await Promise.all(
      providers.map((provider) =>
        provider.getBlockNumber().catch(() => {
          return 0
        })
      )
    )

    // get max block index
    const maxBlockIndex = currentBlocks.indexOf(Math.max(...currentBlocks))
    if (maxBlockIndex === -1 || currentBlocks[maxBlockIndex] === 0) {
      throw new Error("NO_RPC_CONNECTED")
    }

    this.context.currentRpcIndex = maxBlockIndex
    this.context.currentBlock = Number(currentBlocks[maxBlockIndex])

    // check all wallets balance remove under the limit
    this.context.walletsPks = this.context.walletsPks.filter(async (pk) => {
      const signer = new Wallet(pk, providers[this.context.currentRpcIndex])
      const balance = await providers[this.context.currentRpcIndex].getBalance(await signer.getAddress())
      return balance > BigInt(indexerConfig.minEthBalance * 10 ** 18)
    })
  }

  constructor(marketBorrowerRepository: MarketBorrowerRepository, context: LiquidationExecutionContext, LiquidationBotService?: LiquidationBotService) {
    this.marketBorrowerRepository = marketBorrowerRepository
    this.context = context
    this.liquidationBotService = LiquidationBotService
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
    providers: JsonRpcProvider[],
    markets: AddressLike[],
    borrowers: LiquidationUserInInfo[]
  ): Promise<LiquidationMarketAccountOutInfo | undefined> {
    // get the data from the  all the providers
    const calls = providers.map((provider, index) =>
      chainView<[AddressLike[], LiquidationUserInInfo[]], [LiquidationMarketAccountOutInfo]>(
        provider,
        MarketAccountLiquidationBotInfoAbi.abi,
        MarketAccountLiquidationBotInfoAbi.bytecode,
        [markets, borrowers]
      )
    )

    const results = await Promise.all(calls)
    const datas = results.map((result, callIndex) => {
      const d = result?.at(0)
      if (d) {
        return {
          markets: d.markets.map((m) => (m as unknown as WithToObject<LiquidationMarketOutInfo>).toObject()),
          accounts: d.accounts.map((a, index) => ({ ...(a as unknown as WithToObject<LiquidationAccountOutInfo>).toObject(), callIndex, index })),
        }
      }
      return undefined
    })

    // remove duplicates in markets
    const marketsResult = datas
      .map((d) => d?.markets || [])
      .flat()
      .filter((m, index, self) => self.findIndex((t) => t.market === m.market) === index)

    // remove duplicates in accounts and keep the one with the highest healthRatio
    const finalAccounts = []
    const accountLength = datas?.at(0)?.accounts?.length || 0
    const accountsFlat = datas.map((d) => d?.accounts || []).flat()
    for (let i = 0; i < accountLength; i++) {
      const results = accountsFlat.filter((a) => a.index === i)
      const minHealthRatio = results.reduce<bigint | undefined>((acc, curr) => (acc && acc < curr.healthRatio ? acc : curr.healthRatio), undefined)

      const row = results.find((a) => a.healthRatio === minHealthRatio)
      finalAccounts.push(row)
    }
    const finalAccountsResult = finalAccounts.filter((a) => a !== undefined)
    return { markets: marketsResult, accounts: finalAccountsResult as LiquidationAccountOutInfo[] }
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
        ltv: accountData.positionValue === 0n ? 0n : (accountData.userDebt * DENOMINATOR) / accountData.positionValue,
      }
    })

    const notDebtorAnymoreList: LiquidationUserInInfo[] = [] // borrower with 0 debt
    let hardLiquidationList: LiquidationUserFullInfo[] = [] // borrower with positionvalue < debt
    let softLiquidationList: LiquidationUserFullInfo[] = [] // borrower with ltv > liquidationThreshold

    // We detect the potential actions we have to do
    hydratedAccounts.forEach((account) => {
      if (account.userDebt === 0n) {
        notDebtorAnymoreList.push({ account: account.account, market: account.market })
        return
      }

      if (account.userDebt >= account.positionValue) {
        hardLiquidationList.push(account as LiquidationUserFullInfo)
        return
      }
      if (account.ltv > account.liquidationThreshold!) {
        softLiquidationList.push(account as LiquidationUserFullInfo)
      }
    })

    const sortFn: (a: LiquidationUserFullInfo, b: LiquidationUserFullInfo) => number = (a, b) => Number(b.positionValue) - Number(a.positionValue)

    hardLiquidationList = hardLiquidationList.sort(sortFn)
    softLiquidationList = softLiquidationList.sort(sortFn)
    console.log("analyzeLiquidation", {
      hardLiquidationList: hardLiquidationList.length,
      softLiquidationList: softLiquidationList.length,
      notDebtorAnymoreList: notDebtorAnymoreList.length,
    })
    return { hardLiquidationList, softLiquidationList, notDebtorAnymoreList }
  }

  //
  /**
   * Prioritizes the liquidation actions.
   * @param hardLiquidationList The list of hard liquidation actions.
   * @param softLiquidationList The list of soft liquidation actions.
   * @returns The prioritized liquidation actions.
   */
  prioritizeActions(
    hardLiquidationList: LiquidationUserFullInfo[],
    softLiquidationList: LiquidationUserFullInfo[]
  ): (LiquidationUserFullInfo & { type: "hard" | "soft" })[] {
    const actionsCount = this.context.walletsPks.length

    // Select the actions by amount desc
    const liquidationList = [
      ...hardLiquidationList.map((a) => ({ ...a, type: "hard" as const })),
      ...softLiquidationList.map((b) => ({ ...b, type: "soft" as const })),
    ]
    const sortedLiquidationList = liquidationList.sort((a, b) => Number(b.positionValue) - Number(a.positionValue))
    const prioritizedLiquidationList: (LiquidationUserFullInfo & { type: "hard" | "soft" })[] = sortedLiquidationList.slice(0, actionsCount)

    return prioritizedLiquidationList || []
  }

  /**
   * Executes a single hard liquidation for a given market and account
   * @param pkIndex  the index of the wallet in the context
   * @param account The account/market address to liquidate
   */
  public async executeHardLiquidation(pkIndex: number, account: LiquidationUserFullInfo) {
    const signer = new Wallet(this.context.walletsPks[pkIndex], this.context.providers[this.context.currentRpcIndex])
    const marketContract = new Contract(account.market as Addressable, MarketExternalActionsAbi.abi, signer)

    try {
      const tx = await marketContract.liquidateBadDebt(account.account)
      await tx.wait() // Wait for the transaction to be mined
      await this.liquidationBotService?.logLiquidationBadDebtExecution(account, this.context)
    } catch (error) {
      await this.liquidationBotService?.logError("liquidation_bad_debt_execution", error as Error, this.context)
    }
  }

  /**
   * Processes a single soft liquidation for a given account
   * @param pkIndex  the index of the wallet in the context
   * @param account The account to be liquidated
   */
  public async executeSoftLiquidation(pkIndex: number, account: LiquidationUserFullInfo) {
    const { route, amount } = await this._getBestRoute(this.context.providers, account)
    if (route) {
      try {
        const signer = new Wallet(this.context.walletsPks[pkIndex], this.context.providers[this.context.currentRpcIndex])
        const marketContract = new Contract(account.market as Addressable, MarketExternalActionsAbi.abi, signer)

        const iface = new Interface(ICurveRouterAbi.abi)
        const data = iface.encodeFunctionData("exchange", [
          route.params.routeAddresses,
          route.params.swapParamsFull,
          account.collateralBalance,
          amount,
          [ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress],
          await signer.getAddress(),
        ])

        await marketContract.liquidate(account.account, MaxUint256, indexerConfig.contracts.curveRouterAddress, 0n, data)

        await this.liquidationBotService?.logLiquidationExecution(account || null, this.context)
      } catch (error) {
        await this.liquidationBotService?.logError("liquidation_execution", error as Error, this.context)
      }
    } else {
      const error = new Error(`No route found for collat :  ${account.collatToken} `)
      await this.liquidationBotService?.logError("liquidation_execution", error as Error, this.context)
    }
  }

  async _getBestRoute(providers: JsonRpcProvider[], account: LiquidationUserFullInfo) {
    const matchingROutes = successRoutes.filter((route) => route.start.toLowerCase() === (account.collatToken as string).toLowerCase())
    if (!matchingROutes.length) {
      return { route: null, amount: 0n }
    }

    // find duplicates in the routes by display
    const uniqueRoutes = matchingROutes.filter((route, index, self) => self.findIndex((t) => t.route === route.route) === index)
    const routeParams = uniqueRoutes.map(
      (route) =>
        ({
          display: route.route,
          _route: route.params.routeAddresses,
          _swap_params: route.params.swapParamsFull,
          _amount: account.positionValue,
          _pools: [ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress, ZeroAddress],
        }) as CurveQuote
    )

    const routesCheck = await chainView<[CurveQuote[]], [[bigint]]>(
      providers[this.context.currentRpcIndex],
      QuoteLiquidationRouterAbi.abi,
      QuoteLiquidationRouterAbi.bytecode,
      [routeParams]
    )
    const results = routesCheck.map((v) => Number(v?.at(0) || 0n))
    const maxValueIndex = results.indexOf(Math.max(...results))
    // TODO check if the max is enough
    return { route: uniqueRoutes[maxValueIndex], amount: routesCheck?.at(maxValueIndex)?.at(0) || 0n }
  }

  /**
   * Processes clean debtors.
   * @param accounts The accounts to be cleaned.
   */
  async processCleanDebtors(accounts: LiquidationUserInInfo[]) {
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
