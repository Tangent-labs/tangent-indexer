import { Interface, Signer, Contract, JsonRpcProvider, formatEther, formatUnits } from "ethers"
import { chainView } from "../utils/chainView.js"

import { TelegramNotifierService } from "./TelegramNotificationServices.js"
import OnchainTxBot from "../abis/OnchainTxBot.json" with { type: "json" }
import IPegKeeperV2 from "../abis/IPegKeeperV2.json" with { type: "json" }
import IRCalculator from "../abis/IRCalculator.json" with { type: "json" }
import RewardAccumulator from "../abis/RewardAccumulator.json" with { type: "json" }
import StablePoolNG from "../abis/StablePoolNG.json" with { type: "json" }
import { toSafeErrorMessage } from "../utils/errors.js"

const pegKeepersKnowErrors = ["Regulator ban", "peg unprofitable"]

const relativeVariationIR = 25
const relativeVariationRC = 25

const addLiquidityTopic = "0x189c623b666b1b45b83d7178f39b8c087cb09774317ca2f53c2d3c3726f222a2"
const removeLiquidityTopic = "0x3631c28b1f9dd213e0319fb167b554d76b6c283a41143eb400a0d1adb1af1755"

export type IRAndRC = {
  lastIR: string
  newIR: string
  lastRC: string
  newRC: string
}

export type OnchainTxBotStruct = {
  profits: string[]
  irsAndRcs: IRAndRC[]
}

export class OnchainTxBotService {
  telegramNotifierService: TelegramNotifierService
  provider: JsonRpcProvider
  signer: Signer

  constructor(telegramNotifierService: TelegramNotifierService, provider: JsonRpcProvider, signer: Signer) {
    this.telegramNotifierService = telegramNotifierService
    this.provider = provider
    this.signer = signer
  }

  async getOnChainData(marketsAddresses: string[], keeperAddresses: string[]) {
    let onChainData: OnchainTxBotStruct
    try {
      onChainData = await chainView<[string[], string[]], OnchainTxBotStruct>(this.provider, OnchainTxBot.abi, OnchainTxBot.bytecode, [
        keeperAddresses,
        marketsAddresses,
      ])
    } catch (e) {
      await this.telegramNotifierService.sendError(`OnchainTxBot chainview has failed: ${toSafeErrorMessage(e)}`)
      throw e
    }
    return onChainData
  }

  async updatePegKeepers(profits: string[], keeperAddresses: string[], keeperNames: string[]) {
    // Iteration through all pegKeeper
    for (let i = 0; i < profits.length; i++) {
      const currentKeeper = keeperNames[i]

      const profit = BigInt(profits[i])
      // If there is some profit to do, it means we can repeg the stablecoin
      if (profit !== 0n) {
        const pegKeeper = new Contract(keeperAddresses[i], IPegKeeperV2.abi, this.signer)
        let gasfeeEstimation: bigint | undefined
        try {
          gasfeeEstimation = await this.estimateSCTx(pegKeeper, "update", [await this.signer.getAddress()], this.provider, this.signer)
        } catch (e: any) {
          const isNormalError = this.isContainsNormalError(e)
          if (!isNormalError) {
            await this.telegramNotifierService.sendError(`Estimation of 'update' on ${currentKeeper} pegkeeper has failed: ${toSafeErrorMessage(e)}`)
          }
        }
        if (gasfeeEstimation) {
          try {
            const tx = await pegKeeper.update(this.signer)
            const receipt = await tx.wait()
            const logs = receipt.logs
            let usecase: "deposit" | "withdraw" = "deposit"
            let liquidityLog: any

            logs.forEach((log: any) => {
              // AddLiquidty case - USG < 1$
              if (log?.topics[0] === addLiquidityTopic) {
                usecase = "deposit"
                liquidityLog = log
              }
              // RemoveLiquidity case - USG > 1$
              else if (log.topics[0] === removeLiquidityTopic) {
                usecase = "withdraw"
                liquidityLog = log
              }
            })

            const parsedLog = new Interface(StablePoolNG).parseLog(liquidityLog)
            if (usecase === "deposit") {
              const dumpedUSG = parsedLog?.args[1][1]
              const keeper = this.telegramNotifierService.escapeMarkdownV2(currentKeeper)
              const amount = this.telegramNotifierService.escapeMarkdownV2(Number(formatEther(dumpedUSG)).toFixed())
              await this.telegramNotifierService.sendMessage(
                `*Keeper notif* 🔔
*LP:* \`${keeper}\`
*Action:* 📈 *${amount} USG* added`,
                true
              )
            } else {
              const boughtUSG = parsedLog?.args[1][1]
              const keeper = this.telegramNotifierService.escapeMarkdownV2(currentKeeper)
              const amount = this.telegramNotifierService.escapeMarkdownV2(Number(formatEther(boughtUSG)).toFixed())
              await this.telegramNotifierService.sendMessage(
                `*Keeper notif* 🔔
*LP:* \`${keeper}\`
*Action:* 📉 *${amount} USG* removed`,
                true
              )
            }
          } catch (e: any) {
            const isNormalError = this.isContainsNormalError(e)

            if (!isNormalError) {
              await this.telegramNotifierService.sendError(`Trigger of 'update' on ${currentKeeper} pegkeeper has failed: ${toSafeErrorMessage(e)}`)
            }
            throw e
          }
        }
      }
    }
  }

  async updateIRAndRC(irsAndRcs: IRAndRC[], markets: any[], irCalc: string, rcCalc: string) {
    const irToCheckpoint = []
    const rcToCheckpoint = []

    // Iteration over all markets
    for (let i = 0; i < irsAndRcs.length; i++) {
      const market = markets[i]
      const irAndRc = irsAndRcs[i]

      let relativeChangeIR = 0
      /// Format in number IRs and RCs ///
      const lastIR = Number(formatEther(irAndRc.lastIR))
      let newIR = Number(formatEther(irAndRc.newIR))

      // Case both current and new IR are equals to 0
      if (lastIR === 0 && newIR === 0) {
        relativeChangeIR = 0
      } else {
        // To prevent the division by 0 we put a very small value on the denominator
        newIR = newIR === 0 ? 0.000001 : newIR
        // Compute relative variations
        relativeChangeIR = Math.abs(((lastIR - newIR) * 100) / newIR)
      }

      let relativeChangeRC = 0
      const lastRC = Number(formatUnits(irAndRc.lastRC, 5))
      let newRC = Number(formatUnits(irAndRc.newRC, 5))

      // Case both current and new IR are equals to 0
      if (lastIR === 0 && newIR === 0) {
        relativeChangeRC = 0
      } else {
        // To prevent the division by 0 we put a very small value on the denominator
        newRC = newRC === 0 ? 0.000001 : newRC
        relativeChangeRC = Math.abs(((lastRC - newRC) * 100) / newRC)
      }

      // If the relative change is bigger than the threshold, we add them in their respective array
      // to be ready for multicheckpoints
      if (relativeChangeIR > relativeVariationIR) {
        irToCheckpoint.push(market)
      }
      if (relativeChangeRC > relativeVariationRC) {
        rcToCheckpoint.push(market)
      }
    }

    /// Checkpoint IR of the markets if needed
    if (irToCheckpoint.length !== 0) {
      const irCalculator = new Contract(irCalc, IRCalculator.abi, this.signer)
      try {
        const txCheckpointIR = await irCalculator.checkpointIRMulti(irToCheckpoint.map((market) => market.marketAddress))
        await txCheckpointIR.wait()
        await this.telegramNotifierService.sendMessage(
          `IR of markets \`${irToCheckpoint.map((market) => market.marketName).join(",")}\` have been checkpointed`
        )
      } catch (e: any) {
        await this.telegramNotifierService.sendError(`Checkpoint IR has failed: ${toSafeErrorMessage(e)}`)
      }
    }

    /// Checkpoint RC of the markets if needed
    if (rcToCheckpoint.length !== 0) {
      const rewardAccumulator = new Contract(rcCalc, RewardAccumulator.abi, this.signer)
      let txCheckpointRC
      let isSuccess = false
      // Here we loop over 0 to 5
      for (let i = 0; i < 5; i++) {
        try {
          txCheckpointRC = await rewardAccumulator.processMultiRewards(
            rcToCheckpoint.map((market) => market.marketAddress),
            await this.signer.getAddress(),
            i
          )
          await txCheckpointRC.wait()
          isSuccess = true
          break
        } catch (e) {}
      }
      if (isSuccess) {
        await this.telegramNotifierService.sendMessage(
          `RC of markets \`${rcToCheckpoint.map((market) => market.marketName).join(",")}\` have been checkpointed`
        )
      } else {
        await this.telegramNotifierService.sendError(`Checkpoint RC has failed`)
      }
    }
  }

  async estimateSCTx(contract: Contract, functionName: string, params: any[], provider: JsonRpcProvider, signer: Signer) {
    const data = contract.interface.encodeFunctionData(functionName, params)
    const txRequest = {
      to: contract.target,
      data,
      from: await signer.getAddress(),
    }
    const gasLimit = await provider.estimateGas(txRequest)
    const feeData = await provider.getFeeData()
    const gasCost = gasLimit * feeData.maxFeePerGas!
    return gasCost
  }

  isContainsNormalError(e: string) {
    return pegKeepersKnowErrors.some((el) => e.toString().includes(el))
  }
}
