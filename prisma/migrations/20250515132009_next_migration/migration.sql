ALTER TABLE "market_deposit" RENAME CONSTRAINT "user_action_pkey" TO "market_deposit_pkey";

ALTER TABLE "market_deposit" DROP COLUMN "amount";

ALTER TABLE "market_deposit" ADD COLUMN "staked_amount" VARCHAR NOT NULL;

ALTER TABLE "market_zap_deposit" ALTER COLUMN "staked_amount" SET DATA TYPE VARCHAR;

ALTER TABLE "market_zap_deposit" ALTER COLUMN "amount_in" SET DATA TYPE VARCHAR;
