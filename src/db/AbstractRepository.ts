import { PrismaClient } from "@prisma/client"
import { TransactionPrisma } from "../type/prisma.js"

export class AbstractRepository {
  prismaClient: PrismaClient | TransactionPrisma

  constructor(prismaClient: PrismaClient) {
    this.prismaClient = prismaClient
  }

  setClient(transaction: TransactionPrisma) {
    this.prismaClient = transaction
  }
}
