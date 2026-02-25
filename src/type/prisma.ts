import { Prisma } from "@prisma/client"

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type TransactionPrisma = Prisma.TransactionClient
