import { AddressLike } from "ethers"

import { liquidationConfig } from "../config/liquidation_config.js"

export type EnsoRoute = {
  amountOut: string | bigint
  priceImpact?: number
  tx?: {
    to?: string
    data?: string
  }
}

export type EnsoRouteRequest = {
  amountIn: bigint
  tokenIn: AddressLike
  tokenOut: AddressLike
  fromAddress: AddressLike
  receiver: AddressLike
  minAmountOut: bigint
}

export class EnsoRouterService {
  async getRoute({ amountIn, tokenIn, tokenOut, fromAddress, receiver, minAmountOut }: EnsoRouteRequest): Promise<EnsoRoute | null> {
    if (!liquidationConfig.enso.apiKey) {
      return null
    }

    const url = new URL(liquidationConfig.enso.baseUrl)
    url.searchParams.set("chainId", "1")
    url.searchParams.set("fromAddress", fromAddress.toString())
    url.searchParams.set("receiver", receiver.toString())
    url.searchParams.set("tokenIn", tokenIn.toString())
    url.searchParams.set("tokenOut", tokenOut.toString())
    url.searchParams.set("amountIn", amountIn.toString())
    url.searchParams.set("minAmountOut", minAmountOut.toString())
    url.searchParams.set("routingStrategy", "router")

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${liquidationConfig.enso.apiKey}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Enso route request failed with status ${response.status}`)
      }

      return (await response.json()) as EnsoRoute
    } catch (error) {
      console.warn(`Failed to fetch Enso route: ${(error as Error).message}`)
      return null
    }
  }
}
