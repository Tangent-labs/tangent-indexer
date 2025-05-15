/*
  Warnings:

  - You are about to drop the `UserAction` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "UserAction";

-- CreateTable
CREATE TABLE "user_action" (
    "id" BIGSERIAL NOT NULL,
    "account" TEXT NOT NULL,
    "staked_amount" DECIMAL(78,0) NOT NULL,
    "block_number" INTEGER NOT NULL,
    "contract_address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_action_pkey" PRIMARY KEY ("id")
);
