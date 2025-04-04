export const prepareSerialize = (data: any) => {
  const json = JSON.stringify(data, (key, value) => {
    if (typeof value === "bigint") {
      return value.toString()
    }
    return value
  })
  return JSON.parse(json)
}
