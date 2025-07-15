import { formatUnits } from "ethers"

export function bigIntToNumber(bigInteger: bigint, decimals: number) {
  return Number(formatUnits(bigInteger, decimals))
}
