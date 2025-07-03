// import { describe, it, expect, vi } from "vitest"
// import { MarketBorrowerService } from "../../services/MarketBorrowerService"
// import { ActiveBorrowersRepository } from "../../db/ActiveBorrowersRepository"
// import { MarketContractsRepository } from "../../db/MarketContractsRepository"
// import { JsonRpcProvider } from "ethers"

// vi.mock("../../eventFectcher/marketBorrowerEventFetcher", () => ({
//   fetchBorrowLogs: vi.fn(),
// }))

// describe("MarketBorrowerService", () => {
//   it("should insert market borrowers with fetched logs", async () => {
//     const mockMarketBorrowerRepository = {
//       updateMarketBorrowers: vi.fn(),
//     }

//     const mockMarketContractsRepository = {
//       getContracts: vi.fn().mockResolvedValue([{ contract_address: "0xMarket1" }, { contract_address: "0xMarket2" }]),
//     }

//     const marketBorrowerService = new MarketBorrowerService(
//       mockMarketBorrowerRepository as any as ActiveBorrowersRepository,
//       mockMarketContractsRepository as any as MarketContractsRepository
//     )

//     const mockProvider = {} as JsonRpcProvider
//     const startingBlock = 1000
//     const endingBlock = 2000

//     const mockLogs = [
//       { borrower: "0xBorrower1", market: "0xMarket1" },
//       { borrower: "0xBorrower2", market: "0xMarket2" },
//     ]

//     ;(fetchBorrowLogs as any).mockResolvedValue(mockLogs)

//     await marketBorrowerService.runDetection(mockProvider, startingBlock, endingBlock)

//     expect(mockMarketContractsRepository.getContracts).toHaveBeenCalled()
//     expect(fetchBorrowLogs).toHaveBeenCalledWith(mockProvider, startingBlock, endingBlock, ["0xMarket1", "0xMarket2"])
//     expect(mockMarketBorrowerRepository.updateMarketBorrowers).toHaveBeenCalledWith([
//       { borrower: "0xBorrower1", market: "0xMarket1" },
//       { borrower: "0xBorrower2", market: "0xMarket2" },
//     ])
//   })
// })
