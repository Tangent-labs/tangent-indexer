import { PrismaClient } from "@prisma/client"
import { TransactionPrisma } from "type/prisma"

export class AbstractRepository {
  prismaClient: PrismaClient | TransactionPrisma

  constructor(prismaClient: PrismaClient) {
    this.prismaClient = prismaClient
  }

  setClient(transaction: TransactionPrisma2) {
    this.prismaClient = transaction
  }
}
