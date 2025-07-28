import { PrismaClient } from "@prisma/client"
import { TransactionPrisma } from "type/prisma"

export class AbstractRepository {
  prismaClient: PrismaClient | TransactionPrisma

  constructor(prismaClient: PrismaClient) {
    this.prismaClient = prismaClient
  }

  setClient(transaction: TransactionPrisma3) {
    this.prismaClient = transaction
  }
}
