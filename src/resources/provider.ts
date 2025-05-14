import { JsonRpcProvider } from "ethers"

export const ETH_NODE = "https://rpc.ankr.com/eth"
export const ETH_PROVIDER = new JsonRpcProvider(ETH_NODE)
