export type TokenBalancesForBoostOut = {
  user: string
  tokenBalance: TokenBalance[]
}
export type TokenBalance = {
  token: string
  balance: string
}

export type NumMap = {
  [key: string]: number
}
