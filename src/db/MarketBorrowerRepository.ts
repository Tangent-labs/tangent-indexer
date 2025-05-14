import { AddressLike } from "ethers"
import { AbstractRepository } from "./AbstractRepository"
import { MarketBorrower } from "type/prisma"
import { Prisma } from "@prisma/client"
export class MarketBorrowerRepository extends AbstractRepository {
  async getList(): Promise<MarketBorrower[]> {
    const prisma = this.prismaClient
    return await prisma.market_borrower.findMany()
  }

  async deleteMarketBorrowers(data: { borrower: string; market: string }[]) {
    const prisma = this.prismaClient

    const where = {
      OR: data.map((d) => ({
        borrower_address: { equals: d.borrower, mode: "insensitive" },
        contract_address: { equals: d.market, mode: "insensitive" },
      })),
    } as Prisma.market_borrowerWhereInput

    await prisma.market_borrower.deleteMany({
      where,
    })
  }

  async updateMarketBorrowers(data: { borrower: AddressLike; market: AddressLike }[]) {
    const prisma = this.prismaClient

    // Get the list of current borrowers from the database
    const currentBorrowers = await prisma.market_borrower.findMany({
      select: {
        borrower_address: true,
        contract_address: true,
      },
    })

    const existingDataMap = new Map(currentBorrowers.map((d) => [`${d.borrower_address}-${d.contract_address}`, d]))
    // **Step 2: Insert new borrowers**
    const toInsert = data
      .filter((d) => !existingDataMap.has(`${d.borrower}-${d.market}`))
      .map((d) => ({
        borrower_address: d.borrower as string,
        contract_address: d.market as string,
        check_date: new Date(),
      }))

    if (toInsert.length > 0) {
      await prisma.market_borrower.createMany({
        data: toInsert,
      })
    }

    // **Step 3: Update check_date for existing borrowers**
    const toUpdate = data.filter((d) => existingDataMap.has(`${d.borrower}-${d.market}`))

    for (const entry of toUpdate) {
      await prisma.market_borrower.updateMany({
        where: {
          borrower_address: entry.borrower as string,
          contract_address: entry.market as string,
        },
        data: {
          check_date: new Date(),
        },
      })
    }
  }
}
