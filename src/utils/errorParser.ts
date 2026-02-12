import { AbiCoder } from "ethers"

/**
 * Extracts and formats error information from Ethers.js errors
 * Handles CALL_EXCEPTION, custom errors, and nested error messages
 */
export function parseEthersError(error: any): {
  message: string
  code?: string
  errorName?: string
  decodedMessage?: string
  rawData?: string
} {
  // Handle empty or undefined errors
  if (!error) {
    return {
      message: "Unknown error: Empty error object",
      code: "UNKNOWN",
    }
  }

  // Extract basic error information first (before checking if object is empty)
  // This handles regular Error objects which have message, name, stack
  // Check for message property directly (Error objects have message as own property)
  const hasMessage = "message" in error && error.message
  const code = error.code || error.info?.error?.code || undefined
  const message = error.message || error.shortMessage || error.info?.error?.message || String(error)
  const data = error.data || error.info?.error?.data?.data || error.info?.data?.data

  // If we have a message, it's not an empty error object
  // Also check if it's a regular Error instance
  const isRegularError = error instanceof Error || hasMessage

  // Only treat as empty if it's truly empty (no message, not an Error instance, and no keys)
  if (!hasMessage && !isRegularError && typeof error === "object" && Object.keys(error).length === 0) {
    return {
      message: "Unknown error: Empty error object",
      code: "UNKNOWN",
    }
  }

  // If we have a message from a regular Error (no data field), return it early
  // This handles standard JavaScript Error objects
  if (hasMessage && !data && error instanceof Error) {
    return {
      message,
      code: code || "UNKNOWN",
      errorName: error.name || "Error",
    }
  }

  // Try to decode custom errors
  let errorName: string | undefined
  let decodedMessage: string | undefined

  if (data && typeof data === "string" && data.startsWith("0x")) {
    try {
      // Try to decode Error(string) - selector is 0x08c379a0
      if (data.includes("0x08c379a0")) {
        // Extract the error data after the selector
        const errorDataIndex = data.indexOf("0x08c379a0")
        if (errorDataIndex !== -1) {
          // The Error(string) selector is 4 bytes, then comes the encoded string
          // We need to find where the actual error data starts
          // Format: 0x...08c379a0... (selector) + offset (32 bytes) + length (32 bytes) + string data
          const afterSelector = data.slice(errorDataIndex + 10) // Skip "0x08c379a0"
          if (afterSelector.length >= 128) {
            // Skip offset (64 hex chars = 32 bytes) and get length
            const lengthHex = afterSelector.slice(64, 128)
            const length = parseInt(lengthHex, 16)
            if (length > 0 && length < 1000) {
              // Extract the string data
              const stringData = afterSelector.slice(128, 128 + length * 2)
              try {
                decodedMessage = AbiCoder.defaultAbiCoder().decode(["string"], "0x" + stringData)[0]
              } catch (e) {
                // If direct decode fails, try alternative parsing
                const bytes = Buffer.from(stringData, "hex")
                decodedMessage = bytes.toString("utf8").replace(/\0/g, "")
              }
            }
          }
        }
      }

      // Try to decode ZapCallError - it contains an encoded error
      // ZapCallError(bytes) - we need to check if the data matches this pattern
      if (data.includes("6a4e6bdb")) {
        // 0x6a4e6bdb is likely the selector for ZapCallError(bytes)
        errorName = "ZapCallError"
        // The bytes parameter contains the encoded error
        // Extract the bytes data after the selector
        const zapErrorDataIndex = data.indexOf("6a4e6bdb")
        if (zapErrorDataIndex !== -1) {
          const afterSelector = data.slice(zapErrorDataIndex + 8) // Skip "6a4e6bdb"
          if (afterSelector.length >= 128) {
            // Skip offset (64 hex chars = 32 bytes) and get length
            const lengthHex = afterSelector.slice(64, 128)
            const length = parseInt(lengthHex, 16)

            // Handle empty bytes case
            if (length === 0) {
              decodedMessage = "Empty error bytes - likely invalid transaction parameters (e.g., minAmount is 0)"
            } else if (length > 0 && length < 2000) {
              // Extract the bytes data
              const bytesData = afterSelector.slice(128, 128 + length * 2)
              // This bytes data should contain the encoded Error(string)
              if (bytesData.includes("08c379a0")) {
                const errorStringIndex = bytesData.indexOf("08c379a0")
                const afterErrorSelector = bytesData.slice(errorStringIndex + 8)
                if (afterErrorSelector.length >= 128) {
                  const errorLengthHex = afterErrorSelector.slice(64, 128)
                  const errorLength = parseInt(errorLengthHex, 16)
                  if (errorLength > 0 && errorLength < 1000) {
                    const errorStringData = afterErrorSelector.slice(128, 128 + errorLength * 2)
                    try {
                      decodedMessage = AbiCoder.defaultAbiCoder().decode(["string"], "0x" + errorStringData)[0]
                    } catch (e) {
                      const bytes = Buffer.from(errorStringData, "hex")
                      decodedMessage = bytes.toString("utf8").replace(/\0/g, "")
                    }
                  }
                }
              } else {
                // ZapCallError has bytes but no Error(string) inside - try to decode as raw bytes
                try {
                  const rawBytes = Buffer.from(bytesData, "hex")
                  const text = rawBytes.toString("utf8").replace(/\0/g, "").trim()
                  if (text.length > 0) {
                    decodedMessage = `Raw error bytes: ${text}`
                  } else {
                    decodedMessage = `ZapCallError with ${length} bytes of data (no decodable error message)`
                  }
                } catch (e) {
                  decodedMessage = `ZapCallError with ${length} bytes of data (failed to decode)`
                }
              }
            }
          }
        }
      }
    } catch (e) {
      // If decoding fails, we'll just use the raw message
      console.warn("Failed to decode error data:", e)
    }
  }

  // Build a comprehensive error message
  let finalMessage = message
  if (errorName) {
    finalMessage = `${errorName}: ${decodedMessage || message}`
  } else if (decodedMessage) {
    finalMessage = `${message} (decoded: ${decodedMessage})`
  }

  return {
    message: finalMessage,
    code: code?.toString(),
    errorName,
    decodedMessage,
    rawData: data,
  }
}
