// import { beforeEach, describe, expect, it, vi } from "vitest"
// import { PrismaClient } from "@prisma/client"

// import { ActiveBorrowersRepository } from "../../db/ActiveBorrowersRepository"
// import { UserAction } from "services/events/UserMarketService"
// import { QuoteIn, RouterService } from "services/LiquidationExecutionContext"
// import { LiquidationExecutionContext } from "services/LiquidationExecutionContext"
// import { formatUnits, JsonRpcProvider, parseEther } from "ethers"
// import { commonERC20, PendlePools } from "@tangent/defi-resources"

// import addresses from "../../addresses.json"

// // Import the mock version of Prisma
// export const prismaMock = {
//   active_borrowers: {
//     findMany: vi.fn(),
//     deleteMany: vi.fn(),
//     updateMany: vi.fn(),
//     createMany: vi.fn(),
//   },
// }
// // Mock PrismaClient and ensure all instances return our mock
// vi.mock("@prisma/client", () => ({
//   PrismaClient: vi.fn(() => prismaMock),
// }))

// describe("RoutingService - Pendle PT Liquidation", () => {
//   let context: LiquidationExecutionContext = new LiquidationExecutionContext()
//   let rpc: JsonRpcProvider = new JsonRpcProvider("http://127.0.0.1:8545")
//   let routerService: RouterService = new RouterService(context, [rpc])

//   let quoteIn: QuoteIn = { tokenIn: PendlePools["USDe 09/25/25"].PT, tokenOut: addresses.tokens.USG, amountIn: parseEther("1000000") }

//   it("should delete borrowers that exist in the database", async () => {
//     const quote = await routerService.getQuotes(quoteIn)
//   })
// })
