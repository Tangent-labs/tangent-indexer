/*
  Warnings:

  - You are about to drop the column `account` on the `user_action` table. All the data in the column will be lost.
  - You are about to drop the column `block_number` on the `user_action` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `user_action` table. All the data in the column will be lost.
  - You are about to drop the column `staked_amount` on the `user_action` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "user_action" DROP COLUMN "account",
DROP COLUMN "block_number",
DROP COLUMN "created_at",
DROP COLUMN "staked_amount",
ADD COLUMN     "check_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "depositer" VARCHAR,
ALTER COLUMN "contract_address" DROP NOT NULL,
ALTER COLUMN "contract_address" SET DATA TYPE VARCHAR;
