import { JsonRpcProvider } from "ethers"
import { fetchErc20Logs } from "../../services/ERC20TransferService"
import * as dotenv from "dotenv"
dotenv.config()

async function main() {
  // const provider = new JsonRpcProvider('https://eth.llamarpc.com');
  const provider = new JsonRpcProvider(process.env.CHAIN_RPC)
  const contracts = [
    "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
    // '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    // '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
    "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
  ]
  await fetchErc20Logs(provider, 21822151, 21822170, contracts)
}
main().then(() => console.log("Done"))
