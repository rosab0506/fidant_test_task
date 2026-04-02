-- CreateTable: daily_usage_cache for pre-calculated daily aggregates
CREATE TABLE "daily_usage_cache" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date_key" VARCHAR(10) NOT NULL,
    "committed_count" INTEGER NOT NULL DEFAULT 0,
    "reserved_count" INTEGER NOT NULL DEFAULT 0,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_usage_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: enforce one cache row per user per day
CREATE UNIQUE INDEX "daily_usage_cache_user_id_date_key_key" ON "daily_usage_cache"("user_id", "date_key");

-- CreateIndex: for fast lookups by user + date range
CREATE INDEX "daily_usage_cache_user_id_date_key_idx" ON "daily_usage_cache"("user_id", "date_key");
