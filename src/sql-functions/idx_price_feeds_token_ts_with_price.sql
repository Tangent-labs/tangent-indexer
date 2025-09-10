
CREATE INDEX IF NOT EXISTS idx_price_feeds_token_ts_with_price
  ON points.price_feeds (token, "timestamp") INCLUDE (price_usd);