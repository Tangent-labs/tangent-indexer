/*
  Warnings:

  - You are about to alter the column `amount` on the `market_deposit` table. The data in that column could be lost. The data in that column will be cast from `Decimal(78,0)` to `BigInt`.
  - You are about to alter the column `staked_amount` on the `market_zap_deposit` table. The data in that column could be lost. The data in that column will be cast from `Decimal(78,0)` to `BigInt`.
  - You are about to alter the column `amount_in` on the `market_zap_deposit` table. The data in that column could be lost. The data in that column will be cast from `Decimal(78,0)` to `BigInt`.
  - Made the column `address` on table `market_deposit` required. This step will fail if there are existing NULL values in that column.
  - Made the column `amount` on table `market_deposit` required. This step will fail if there are existing NULL values in that column.
  - Made the column `depositer` on table `market_deposit` required. This step will fail if there are existing NULL values in that column.
  - Made the column `address` on table `market_zap_deposit` required. This step will fail if there are existing NULL values in that column.
  - Made the column `staked_amount` on table `market_zap_deposit` required. This step will fail if there are existing NULL values in that column.
  - Made the column `depositer` on table `market_zap_deposit` required. This step will fail if there are existing NULL values in that column.
  - Made the column `token_in` on table `market_zap_deposit` required. This step will fail if there are existing NULL values in that column.
  - Made the column `amount_in` on table `market_zap_deposit` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "market_deposit" ALTER COLUMN "address" SET NOT NULL,
ALTER COLUMN "amount" SET NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE BIGINT,
ALTER COLUMN "depositer" SET NOT NULL;

-- AlterTable
ALTER TABLE "market_zap_deposit" ALTER COLUMN "address" SET NOT NULL,
ALTER COLUMN "staked_amount" SET NOT NULL,
ALTER COLUMN "staked_amount" SET DATA TYPE BIGINT,
ALTER COLUMN "depositer" SET NOT NULL,
ALTER COLUMN "token_in" SET NOT NULL,
ALTER COLUMN "amount_in" SET NOT NULL,
ALTER COLUMN "amount_in" SET DATA TYPE BIGINT;
