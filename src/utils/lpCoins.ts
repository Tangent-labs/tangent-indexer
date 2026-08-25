import { Contract, JsonRpcProvider } from "ethers"

const CURVE_POOL_COINS_ABI = ["function coins(uint256 index) view returns (address)"]
const ERC20_DECIMALS_ABI = ["function decimals() view returns (uint8)"]

export type LpCoins = {
  token0: string
  token0Decimals: number
  token1: string
  token1Decimals: number
}

/**
 * @notice  Reads the coin order and decimals of a Curve pool. Both are fixed at pool creation, so
 *          this is called once when seeding usg_lp_keys and never on a runtime path: the volume
 *          computation reads the persisted values instead.
 */
export async function fetchLpCoins(provider: JsonRpcProvider, lpAddress: string): Promise<LpCoins> {
  const pool = new Contract(lpAddress, CURVE_POOL_COINS_ABI, provider)
  const [token0, token1] = await Promise.all([pool.coins(0), pool.coins(1)])

  const [token0Decimals, token1Decimals] = await Promise.all([
    new Contract(token0, ERC20_DECIMALS_ABI, provider).decimals(),
    new Contract(token1, ERC20_DECIMALS_ABI, provider).decimals(),
  ])

  return {
    token0: String(token0).toLowerCase(),
    token0Decimals: Number(token0Decimals),
    token1: String(token1).toLowerCase(),
    token1Decimals: Number(token1Decimals),
  }
}
