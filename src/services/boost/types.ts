export type TokenBalance = {
  token: string
  balance: string
}

export type TokenBalancesForBoostOut = {
  user: string
  tokenBalance: TokenBalance[]
}

export type NumMap = {
  [key: string]: number
}
