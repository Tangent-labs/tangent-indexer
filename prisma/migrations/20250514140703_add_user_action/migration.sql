-- CreateTable
CREATE TABLE "global_blocks" (
    "block_id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6),

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("block_id")
);

-- CreateTable
CREATE TABLE "market_contracts" (
    "id" BIGSERIAL NOT NULL,
    "contract_name" VARCHAR,
    "contract_address" VARCHAR,
    "contract_type" VARCHAR,

    CONSTRAINT "markets_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_borrower" (
    "id" BIGSERIAL NOT NULL,
    "contract_address" VARCHAR,
    "borrower_address" VARCHAR,
    "check_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "markets_borrower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidation_bot_log" (
    "id" BIGSERIAL NOT NULL,
    "execution_key" UUID NOT NULL,
    "is_error" BOOLEAN NOT NULL DEFAULT false,
    "action" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liquidation_bot_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAction" (
    "id" SERIAL NOT NULL,
    "account" TEXT NOT NULL,
    "staked_amount" DECIMAL(78,0) NOT NULL,
    "block_number" INTEGER NOT NULL,
    "contract_address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "markets_contracts_contract_address_idx" ON "market_contracts"("contract_address");

-- CreateIndex
CREATE INDEX "liquidation_bot_log_execution_key_idx" ON "liquidation_bot_log"("execution_key");
