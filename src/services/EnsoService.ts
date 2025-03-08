import { AddressLike } from "ethers"
import axios from "axios"
import { indexerConfig } from "config/indexer_config"

const baseURl = `${indexerConfig.enso.baseUrl}?chainId=1`

export const getTokenInQuote = async (amount: bigint | undefined, fromAddress: AddressLike, inToken: AddressLike, outToken: AddressLike) => {
  try {
    const url = `${baseURl}&fromAddress=${fromAddress}&amountIn=${amount}&tokenOut=${outToken}&tokenIn=${inToken}`

    const response = await axios.get(url, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NEXT_ENSO_API_KEY}`,
      },
    })

    if (response.status !== 200) {
      throw new Error(`API request failed with status ${response.status}`)
    }

    return response.data
  } catch (error) {
    console.error("Failed to fetch Enso data:", error)
    return null
  }
}

export const getRouteTxData = async (
  amountIn: bigint | undefined,
  inToken: AddressLike,
  outToken: AddressLike,
  fromAddress: AddressLike,
  receiver: AddressLike,
  slippage?: number
) => {
  try {
    const url = `${baseURl}&fromAddress=${fromAddress}&receiver=${receiver}&tokenIn=${inToken}&tokenOut=${outToken}&amountIn=${amountIn}&slippage=${slippage}&routingStrategy=router`
    const response = await axios.get(url, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NEXT_ENSO_API_KEY}`,
      },
    })

    if (response.status !== 200) {
      throw new Error(`API request failed with status ${response.status}`)
    }

    return await response.data
  } catch (error) {
    console.error("Failed to fetch Enso data:", error)
    return null
  }
}

export const getTokenOutQuote = async (amount: bigint | undefined, fromAddress: AddressLike, inToken: AddressLike, outToken: AddressLike) => {
  try {
    const url = `${baseURl}&fromAddress=${fromAddress}&amountIn=${amount}&tokenIn=${inToken}&tokenOut=${outToken}`

    const response = await await axios.get(url, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NEXT_ENSO_API_KEY}`,
      },
    })

    if (response.status !== 200) {
      throw new Error(`API request failed with status ${response.status}`)
    }

    return await response.data
  } catch (error) {
    console.error("Failed to fetch Enso data:", error)
    return null
  }
}
