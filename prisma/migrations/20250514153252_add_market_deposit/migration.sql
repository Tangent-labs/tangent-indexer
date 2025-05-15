/*
  Warnings:

  - You are about to drop the `user_action` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "user_action";

-- CreateTable
CREATE TABLE "market_deposit" (
    "id" BIGSERIAL NOT NULL,
    "address" VARCHAR,
    "amount" BIGINT,
    "depositer" VARCHAR,
    "check_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_action_pkey" PRIMARY KEY ("id")
);
