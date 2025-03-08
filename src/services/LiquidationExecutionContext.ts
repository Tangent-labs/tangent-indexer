import { v4 as uuidv4 } from "uuid"

export class LiquidationExecutionContext {
  executionKey: string
  isDbAlive: boolean
  currentRpcIndex: number = 0
  currentWalletIndex: number = 0

  constructor() {
    this.executionKey = uuidv4()
    this.isDbAlive = true
  }
}
