import { Prisma, PrismaClient } from "@prisma/client"
import { DefaultArgs } from "@prisma/client/runtime/library"

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type TransactionPrisma = Omit<
  PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>

export type GlobalBlock = Prisma.global_blocksCreateInput
export type MarketContract = Prisma.market_creationsCreateInput
export type MarketBorrower = Prisma.active_borrowersCreateInput
export type LiquidationBotLog = Prisma.liquidation_bot_logCreateInput
