import { parseEther } from "ethers"
import { NumMap } from "./types.js"

export const SNAPSHOT_BOOST_TOKENS = [
  "0xe127cE638293FA123Be79C25782a5652581Db234",
  "0x822ee3715e2c15372e45a4a62376bf786ff45511",
  "0x5f3b5DfEb7B28CDbD7FAba78963EE202a494e2A2",
  "0xEC6B8A3F3605B083F7044C0F31f2cac0caf1d469",
  "0x08d23468A467d2bb86FaE0e32F247A26C7E2e994",
  "0x22222222E9fE38F6f1FC8C61b25228adB4D8B953",
]

export const ONCHAIN_BOOST_INFOS: { [key: string]: { min: bigint; boost: number; key: string } } = {
  "0xe127cE638293FA123Be79C25782a5652581Db234": { min: 1n, boost: 0.5, key: "LLAMA_NFT" }, // Llama NFT
  "0x822ee3715e2c15372e45a4a62376bf786ff45511": { min: 1n, boost: 0.75, key: "CVG_PEPE" }, // CVG PEPE
  "0x5f3b5DfEb7B28CDbD7FAba78963EE202a494e2A2": { min: parseEther("2500"), boost: 0.25, key: "veCRV" }, // veCRV
  "0x72a19342e8F1838460eBFCCEf09F6585e32db86E": { min: parseEther("500"), boost: 0.25, key: "vlCVX" }, // vlCVX
  "0xEC6B8A3F3605B083F7044C0F31f2cac0caf1d469": { min: parseEther("25"), boost: 0.25, key: "veFXN" }, // veFXN
  "0x08d23468A467d2bb86FaE0e32F247A26C7E2e994": { min: parseEther("50"), boost: 0.25, key: "sINV" }, // sINV
  "0x22222222E9fE38F6f1FC8C61b25228adB4D8B953": { min: parseEther("2500"), boost: 0.25, key: "stRSUP" }, // stRSUP
}

export const OFFCHAIN_BOOST_INFOS: NumMap = {
  CVG_COMPENSATION: 1,
  LP_DEALS: 1,
  DEWHALE_MEMBERS: 0.75,
  ONBOARDED: 0.1,
}
