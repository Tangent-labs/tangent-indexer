-- One row per clipped segment with all intermediates
CREATE OR REPLACE FUNCTION points.get_user_points_details(
  start_at timestamptz,
  end_at   timestamptz
)
RETURNS TABLE (
  user_task_id    bigint,
  task_id         bigint,
  user_address    text,
  token_address   text,
  seg_start       timestamptz,
  seg_end         timestamptz,
  hours_in_seg    double precision,
  amount          numeric,
  point_rate      numeric,
  avg_price_usd   numeric,
  base_points     int,
  boost_factor    double precision,
  booster_points  int,
  total_points    int
)
LANGUAGE sql
AS $$
  WITH params AS (
    SELECT start_at AS start_at, end_at AS end_at
  ),
  clip AS (
    SELECT
      ut.id                                   AS user_task_id,
      ut.task_id,
      ut.user_address,
      t.token_address,
      t.point_rate,                           -- points per hour per USD
      GREATEST(ut.start, p.start_at)          AS seg_start,
      LEAST(COALESCE(ut.closed, p.end_at), p.end_at) AS seg_end,
      NULLIF(TRIM(ut.amount), '')::numeric / POWER(10, 18)    AS amount
    FROM points.user_tasks ut
    JOIN points.task t
      ON t.id = ut.task_id
     AND t.unit  in ('hour','day')
     AND t.is_active IS TRUE
    CROSS JOIN params p
    WHERE ut.start < p.end_at
      AND COALESCE(ut.closed, p.end_at) > p.start_at
  ),
  seg_price AS (
    SELECT
      c.*,
      COALESCE(
        ( SELECT AVG(NULLIF(pf.price_usd, 0)::numeric)
          FROM points.price_feeds pf
          WHERE pf.token = c.token_address
            AND pf.timestamp >= c.seg_start
            AND pf.timestamp <  c.seg_end ),
        ( SELECT NULLIF(pf2.price_usd, 0)::numeric
          FROM points.price_feeds pf2
          WHERE pf2.token = c.token_address
            AND pf2.timestamp < c.seg_start
          ORDER BY pf2.timestamp DESC
          LIMIT 1 )
      ) AS avg_price_usd
    FROM clip c
    WHERE c.seg_end > c.seg_start
  ),
  seg_with_mult AS (
    SELECT
      sp.*,
      COALESCE(
        (
          SELECT SUM(
            GREATEST(
              EXTRACT(EPOCH FROM (
                LEAST(COALESCE(ub.end_at, sp.seg_end), sp.seg_end) -
                GREATEST(ub.start_at, sp.seg_start)
              )) / 3600.0,
              0
            ) * (ub.multiplier - 1.0)
          ) / NULLIF(EXTRACT(EPOCH FROM (sp.seg_end - sp.seg_start)) / 3600.0, 0)
          FROM points.user_boost ub
          WHERE ub.user_address = sp.user_address
            AND ub.start_at < sp.seg_end
            AND COALESCE(ub.end_at, sp.seg_end) > sp.seg_start
        ),
        0.0
      ) AS boost_factor
    FROM seg_price sp
  )
  SELECT
    swm.user_task_id,
    swm.task_id,
    swm.user_address,
    swm.token_address,
    swm.seg_start,
    swm.seg_end,
    EXTRACT(EPOCH FROM (swm.seg_end - swm.seg_start)) / 3600.0 AS hours_in_seg,
    COALESCE(swm.amount, 0)       AS amount,
    swm.point_rate,
    COALESCE(swm.avg_price_usd,0) AS avg_price_usd,
    -- base points for the segment
    ROUND(
      swm.point_rate
      * (EXTRACT(EPOCH FROM (swm.seg_end - swm.seg_start)) / 3600.0)
      * COALESCE(swm.amount, 0)
      * COALESCE(swm.avg_price_usd, 0)
    )::int AS base_points,
    swm.boost_factor, 
    -- booster points for the segment
    ROUND(
      swm.point_rate
      * (EXTRACT(EPOCH FROM (swm.seg_end - swm.seg_start)) / 3600.0)
      * COALESCE(swm.amount, 0)
      * COALESCE(swm.avg_price_usd, 0)
      * swm.boost_factor
    )::int AS booster_points,
    -- total
    ROUND(
      swm.point_rate
      * (EXTRACT(EPOCH FROM (swm.seg_end - swm.seg_start)) / 3600.0)
      * COALESCE(swm.amount, 0)
      * COALESCE(swm.avg_price_usd, 0)
      * (1 + swm.boost_factor)
    )::int AS total_points
  FROM seg_with_mult swm;
$$;