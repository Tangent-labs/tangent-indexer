import { AddressesJson } from "type/data.js"

import addresses from "../../addresses.json" with { type: "json" }

import * as dotenv from "dotenv"
dotenv.config()

export async function getAddressesJson(): Promise<AddressesJson> {
  const env = process.env.ENV
  if (env === "local") {
    return addresses
  } else {
    const addresses = (await (await fetch("https://raw.githubusercontent.com/Tangent-labs/public-files/main/addresses.json")).json()) as AddressesJson
    return addresses
  }
}
