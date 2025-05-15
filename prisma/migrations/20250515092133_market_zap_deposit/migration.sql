-- CreateTable
CREATE TABLE "market_zap_deposit" (
    "id" BIGSERIAL NOT NULL,
    "address" VARCHAR,
    "staked_amount" BIGINT,
    "depositer" VARCHAR,
    "token_in" VARCHAR,
    "amount_in" BIGINT,
    "check_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_zap_deposit_pkey" PRIMARY KEY ("id")
);
