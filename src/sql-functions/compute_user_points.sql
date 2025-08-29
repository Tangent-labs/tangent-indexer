-- Stored procedure to update points.user_points based on task time, token USD price and point_rate
-- This procedure computes base points and booster points for user tasks within a given time window

CREATE OR REPLACE FUNCTION points.compute_user_points(
  start_at timestamptz,
  end_at timestamptz
)
RETURNS void
LANGUAGE sql
AS $$
  -- Update points.user_points.points based on task time, token USD price and point_rate
  -- Params: start_at, end_at as timestamptz
  WITH params AS (
    SELECT
      start_at AS start_at,
      end_at   AS end_at
  ),
  -- Clip each user_task to the requested window [start_at, end_at)
  clip AS (
    SELECT
      ut.id                                   AS user_task_id,
      ut.task_id,
      ut.user_address,
      t.token_address,
      t.point_rate,                           -- points per hour per USD
      GREATEST(ut.start, p.start_at)          AS seg_start,
      LEAST(COALESCE(ut.closed, p.end_at), p.end_at) AS seg_end,
      NULLIF(TRIM(ut.amount), '')::numeric    AS amount
    FROM points.user_tasks ut
    JOIN points.task t
      ON t.id = ut.task_id
             AND t.unit='hour'
    AND t.is_active IS TRUE
    CROSS JOIN params p
    WHERE ut.start < p.end_at
      AND COALESCE(ut.closed, p.end_at) > p.start_at
  ),
  -- Get an average USD price per clipped segment.
  -- Fallback: last price strictly before seg_start if no samples in segment.
  seg_price AS (
    SELECT
      c.*,
      COALESCE(
        (
          SELECT AVG(NULLIF(TRIM(pf.price_usd), '')::numeric)
          FROM points.price_feeds pf
          WHERE pf.token = c.token_address
            AND pf.timestamp >= c.seg_start
            AND pf.timestamp <  c.seg_end
        ),
        (
          SELECT NULLIF(TRIM(pf2.price_usd), '')::numeric
          FROM points.price_feeds pf2
          WHERE pf2.token = c.token_address
            AND pf2.timestamp < c.seg_start
          ORDER BY pf2.timestamp DESC
          LIMIT 1
        )
      ) AS avg_price_usd
    FROM clip c
    WHERE c.seg_end > c.seg_start
  ),
  -- Time-weighted average multiplier per segment from user_boost timeline
  seg_with_mult AS (
    SELECT
      sp.*,
      COALESCE(
        (
          SELECT SUM(
                  GREATEST(
                    EXTRACT(EPOCH FROM (
                      LEAST(COALESCE(ub.end_at, p.end_at), sp.seg_end) -
                      GREATEST(ub.start_at, sp.seg_start)
                    )) / 3600.0,
                    0
                  ) * ub.multiplier
                )
                / NULLIF(SUM(
                  GREATEST(
                    EXTRACT(EPOCH FROM (
                      LEAST(COALESCE(ub.end_at, p.end_at), sp.seg_end) -
                      GREATEST(ub.start_at, sp.seg_start)
                    )) / 3600.0,
                    0
                  )
                ), 0)
          FROM points.user_boost ub
          CROSS JOIN params p
          WHERE ub.user_address = sp.user_address
            AND ub.start_at < sp.seg_end
            AND COALESCE(ub.end_at, p.end_at) > sp.seg_start
        ),
        1.0
      ) AS tw_mult
    FROM seg_price sp
  ),
  -- Aggregate per user_task, compute base and booster points
  per_task AS (
    SELECT
      swm.user_task_id,
      swm.task_id,
      -- base points
      ROUND(SUM(
        (swm.point_rate
        * (EXTRACT(EPOCH FROM (swm.seg_end - swm.seg_start)) / 3600.0)
        * COALESCE(swm.amount, 0)
        * COALESCE(swm.avg_price_usd, 0)
        )
      ))::int AS points,
      -- booster points = time-weighted multiplier minus 1 applied to the same base
      ROUND(SUM(
        (swm.point_rate
        * (EXTRACT(EPOCH FROM (swm.seg_end - swm.seg_start)) / 3600.0)
        * COALESCE(swm.amount, 0)
        * COALESCE(swm.avg_price_usd, 0)
        ) * GREATEST(swm.tw_mult - 1.0, 0)
      ))::int AS booster_points
    FROM seg_with_mult swm
    GROUP BY swm.user_task_id, swm.task_id
  )
  UPDATE points.user_points up
  SET points = pt.points,
      booster_points = pt.booster_points
  FROM per_task pt
  WHERE up.user_task_id = pt.user_task_id
    AND up.task_id      = pt.task_id;
$$;

-- Example usage:
-- SELECT points.compute_user_points('2024-01-01T00:00:00Z'::timestamptz, '2024-01-31T23:59:59Z'::timestamptz);
