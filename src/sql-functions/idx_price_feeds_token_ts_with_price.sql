
CREATE INDEX IF NOT EXISTS idx_price_feeds_token_ts_with_price
  ON points.price_feeds (price_source_id, "timestamp") INCLUDE (price_usd);