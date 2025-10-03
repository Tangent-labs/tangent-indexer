
CREATE INDEX IF NOT EXISTS idx_price_feeds_token_ts_with_price
  ON points.price_feeds (address, "timestamp") INCLUDE (price_usd);