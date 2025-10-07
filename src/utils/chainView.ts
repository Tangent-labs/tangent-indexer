import { ContractFactory, Interface, InterfaceAbi, ContractMethodArgs, BytesLike, Fragment, ZeroAddress, BigNumberish, JsonRpcProvider } from "ethers"

export const chainView = async <A extends any[], R>(
  provider: JsonRpcProvider,
  abi: InterfaceAbi,
  bytecode: BytesLike,
  params: ContractMethodArgs<A>,
  options: { from?: string; value?: bigint; blockTag?: BigNumberish } = {}
): Promise<R> => {
  const ChainViewInterface = new Interface(abi)
  const errorNamesExpected = ChainViewInterface.fragments.filter((f): f is Fragment & { name: string } => f.type === "error").map((error) => error.name)
  const ChainView = new ContractFactory(abi, bytecode, provider)

  // get deploy data transaction
  const deploy = await ChainView.getDeployTransaction(...params)
  deploy.from = options.from || ZeroAddress
  deploy.value = options.value || 0n
  if (options.blockTag) {
    deploy.blockTag = options.blockTag
  }

  // simulate the deployment of the contract
  let dataError: any
  try {
    await provider.call(deploy)
  } catch (e: any) {
    const errorCode = checkNetworkError(e)
    if (errorCode) {
      throw new Error(`Network error: ${errorCode} , message: ${e.message || "-"}`)
    }
    dataError = e.data
  }

  // decode data returned by the fake deployment
  const decoded = ChainViewInterface.parseError(dataError?.trim())
  const errorName = decoded!.name
  if (!errorNamesExpected.includes(errorName)) {
    throw new Error(`ChainView Error: ${decoded?.name} with arg ${decoded?.args} at selector ${decoded?.selector}`)
  } else {
    return decoded!.args as R
  }
}

const checkNetworkError = (error: Error & { code?: string; erno?: string }): string | false => {
  const list = ["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ETIMEDOUT", "ENOTFOUND", "EPIPE"]

  let errorCode = list.find((item) => error?.message.includes(item))
  errorCode = errorCode || list.find((item) => error?.code?.includes(item) || error?.erno?.includes(item))

  return errorCode || false
}
