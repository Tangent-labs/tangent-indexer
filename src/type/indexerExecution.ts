export const INDEXER_EXECUTION_STATUS = {
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
} as const

export type IndexerExecutionStatus = (typeof INDEXER_EXECUTION_STATUS)[keyof typeof INDEXER_EXECUTION_STATUS]

export const INDEXER_EXECUTION_NAMES = {
  BLOCK: "block_indexer",
  GLOBAL_DATA: "global_data_indexer",
  LIQUIDATION_CHECK: "liquidation_check",
  LIQUIDATION_PROCESS: "liquidation_process",
  ONCHAIN_TX_BOT: "onchain_tx_bot",
  PEG_KEEPER_UPDATE: "peg_keeper_update",
  PREDEPOSIT: "predeposit_script",
  POINTS_LP: "points_lp_indexer",
  POINTS_VOTES: "points_votes_indexer",
  SNAPSHOT_PRICES: "snapshot_prices",
} as const

export type IndexerExecutionName = (typeof INDEXER_EXECUTION_NAMES)[keyof typeof INDEXER_EXECUTION_NAMES]

export type IndexerExecutionLogEntry = {
  indexerName: IndexerExecutionName
  status: IndexerExecutionStatus
  startedAt: Date
  finishedAt: Date
  errorMessage?: string | null
}
