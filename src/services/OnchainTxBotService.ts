import { Contract, formatEther, formatUnits, Interface, JsonRpcProvider, Signer } from "ethers"

import IPegKeeperV2 from "../abis/IPegKeeperV2.json" with { type: "json" }
import IRCalculator from "../abis/IRCalculator.json" with { type: "json" }
import OnchainTxBot from "../abis/OnchainTxBot.json" with { type: "json" }
import RewardAccumulator from "../abis/RewardAccumulator.json" with { type: "json" }
import StablePoolNG from "../abis/StablePoolNG.json" with { type: "json" }
import { INDEXER_EXECUTION_NAMES } from "../type/indexerExecution.js"
import { chainView } from "../utils/chainView.js"
import { toSafeErrorMessage } from "../utils/errors.js"
import { IndexerExecutionLogService } from "./IndexerExecutionLogService.js"
import { TelegramNotifierService } from "./TelegramNotificationServices.js"

const pegKeepersKnowErrors = ["Regulator ban", "peg unprofitable"]

// Checkpoint only if BOTH: |delta| >= min absolute (percentage points) AND relative delta >= min relative (%).
// Absolute floor kills noise on small values (0.2% -> 0.4% is +100% but only 0.2pp).
const IR_MIN_ABS_PP = 0.5
const IR_MIN_REL_PCT = 25
const RC_MIN_ABS_PP = 1
const RC_MIN_REL_PCT = 25
// Skip IR/RC checkpoints during gas spikes; override with MAX_GAS_PRICE_GWEI.
const MAX_GAS_PRICE_GWEI = Number(process.env.MAX_GAS_PRICE_GWEI ?? 1.2)

/** last/next as fractions (0.05 = 5%). */
export function shouldCheckpoint(last: number, next: number, minAbsPP: number, minRelPct: number) {
  const absPP = Math.abs(next - last) * 100
  if (absPP < minAbsPP) return false
  if (last === 0) return true
  return (absPP / (Math.abs(last) * 100)) * 100 >= minRelPct
}

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
  indexerExecutionLogService?: IndexerExecutionLogService

  constructor(
    telegramNotifierService: TelegramNotifierService,
    provider: JsonRpcProvider,
    signer: Signer,
    indexerExecutionLogService?: IndexerExecutionLogService
  ) {
    this.telegramNotifierService = telegramNotifierService
    this.provider = provider
    this.signer = signer
    this.indexerExecutionLogService = indexerExecutionLogService
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
    const runPegKeeperUpdate = async () => {
      for (let i = 0; i < profits.length; i++) {
        const currentKeeper = keeperNames[i]
        const profit = BigInt(profits[i])

        if (profit === 0n) {
          continue
        }

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

        if (!gasfeeEstimation) {
          continue
        }

        try {
          const tx = await pegKeeper.update(this.signer)
          const receipt = await tx.wait()
          const logs = receipt.logs
          let usecase: "deposit" | "withdraw" = "deposit"
          let liquidityLog: any

          logs.forEach((log: any) => {
            if (log?.topics[0] === addLiquidityTopic) {
              usecase = "deposit"
              liquidityLog = log
            } else if (log.topics[0] === removeLiquidityTopic) {
              usecase = "withdraw"
              liquidityLog = log
            }
          })

          const parsedLog = new Interface(StablePoolNG).parseLog(liquidityLog)
          if (usecase === "deposit") {
            const dumpedUSG = parsedLog?.args[1][1]
            const keeper = this.telegramNotifierService.escapeMarkdownV2(currentKeeper)
            const amount = this.telegramNotifierService.escapeMarkdownV2(Number(formatEther(dumpedUSG)).toFixed())
            await this.telegramNotifierService.sendMessage(`*Keeper notif*\n*LP:* \`${keeper}\`\n*Action:* *${amount} USG* added`, true)
          } else {
            const boughtUSG = parsedLog?.args[1][1]
            const keeper = this.telegramNotifierService.escapeMarkdownV2(currentKeeper)
            const amount = this.telegramNotifierService.escapeMarkdownV2(Number(formatEther(boughtUSG)).toFixed())
            await this.telegramNotifierService.sendMessage(`*Keeper notif*\n*LP:* \`${keeper}\`\n*Action:* *${amount} USG* removed`, true)
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

    if (!this.indexerExecutionLogService) {
      await runPegKeeperUpdate()
      return
    }

    await this.indexerExecutionLogService.run(INDEXER_EXECUTION_NAMES.PEG_KEEPER_UPDATE, runPegKeeperUpdate)
  }

  async updateIRAndRC(irsAndRcs: IRAndRC[], markets: any[], irCalc: string, rcCalc: string) {
    const irToCheckpoint = []
    const rcToCheckpoint = []

    for (let i = 0; i < irsAndRcs.length; i++) {
      const { lastIR, newIR, lastRC, newRC } = irsAndRcs[i]
      if (shouldCheckpoint(Number(formatEther(lastIR)), Number(formatEther(newIR)), IR_MIN_ABS_PP, IR_MIN_REL_PCT)) {
        irToCheckpoint.push(markets[i])
      }
      if (shouldCheckpoint(Number(formatUnits(lastRC, 5)), Number(formatUnits(newRC, 5)), RC_MIN_ABS_PP, RC_MIN_REL_PCT)) {
        rcToCheckpoint.push(markets[i])
      }
    }

    if (irToCheckpoint.length === 0 && rcToCheckpoint.length === 0) return

    const { gasPrice } = await this.provider.getFeeData()
    const gasGwei = Number(formatUnits(gasPrice ?? 0n, "gwei"))
    if (gasGwei > MAX_GAS_PRICE_GWEI) {
      console.log(`Gas ${gasGwei.toFixed(2)} gwei > ${MAX_GAS_PRICE_GWEI} gwei, skipping IR/RC checkpoints`)
      return
    }

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

    if (rcToCheckpoint.length !== 0) {
      const rewardAccumulator = new Contract(rcCalc, RewardAccumulator.abi, this.signer)
      let txCheckpointRC
      let isSuccess = false

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
