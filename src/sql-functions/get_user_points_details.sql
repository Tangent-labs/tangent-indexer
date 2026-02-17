
-- Pipeline (high level)

-- Clip
-- For each active task, compute seg_start = max(task.start, start_at) and seg_end = min(task.closed or end_at, end_at). Ignore if seg_end <= seg_start. Amount is normalized from wei to units. 
-- Price
-- Compute a time-weighted average price across the segment from price_feeds. If no feed overlaps, extend the last known price before seg_start (fallback). 
-- Boost factor
-- Compute a time-weighted average of (multiplier − 1.0) from user_boost records overlapping the segment. No boosts ⇒ 0.0. 
-- Points
-- Using point rate (token’s point_rate = points per second per USD), segment duration (seconds), amount, and avg price:

-- base_points = round(rate * seconds * amount * avg_price)
-- booster_points = round(base_points * boost_factor)
-- total_points = round(base_points * (1 + boost_factor))

-- Referral (godfather)
-- Select at most one referral usage for the task’s user that occurs on or before seg_end (earliest by time). Compute time_weight for the segment:
-- Referral before seg_start → time_weight = 1.0
-- Referral after seg_end → time_weight = 0.0
-- Referral inside the segment → fraction of segment after referral
-- Then: godfather_points = round(total_points * 0.10 * time_weight); if no referral, 0.


CREATE OR REPLACE FUNCTION points.get_user_points_details(
  start_at timestamp,
  end_at   timestamp
)
RETURNS TABLE (
  lp_task_id     bigint,
  task_id          bigint,
  user_address     text,
  token_address    text,
  seg_start        timestamp,
  seg_end          timestamp,
  hours_in_seg     double precision,
  amount           numeric,
  point_rate       numeric,
  avg_price_usd    numeric,
  base_points      bigint,
  boost_factor     double precision,
  booster_points   bigint,
  total_points     bigint,
  godfather_id     bigint,
  time_weight      double precision,
  godfather_points bigint
)
LANGUAGE sql
AS $$
  WITH params AS (
    SELECT start_at AS start_at, end_at AS end_at
  ),
  clip AS (
    SELECT
      ut.id                                        AS lp_task_id,
      ut.task_id,
      ut.user_address,
      t.token_address,
      t.point_rate,                                -- points per second per USD
      t.price_source_id,
      -- Clip to the intersection of: user participation, query window, AND task active period
      GREATEST(
        ut.start_date, 
        p.start_at,
        t.start_date                    
      ) AS seg_start, -- Task must have started
      LEAST(
        COALESCE(ut.closed_date, p.end_at),
        p.end_at,
        COALESCE(t.end_date, p.end_at)  -- Task may have ended
      ) AS seg_end,
      NULLIF(ut.amount, '')::numeric / POWER(10, 18) AS amount
    FROM points.lp_user_tasks ut
    JOIN points.lp_task t
      ON t.id = ut.task_id
    CROSS JOIN params p
    WHERE ut.start_date < p.end_at
      AND COALESCE(ut.closed_date, p.end_at) > p.start_at
      -- Only include tasks that overlap with the query window
      AND t.start_date < p.end_at
      AND COALESCE(t.end_date, p.end_at) > p.start_at
  ),
  seg_price AS (
    SELECT
      c.*,
      EXTRACT(EPOCH FROM (c.seg_end - c.seg_start))        AS seg_seconds,
      COALESCE(
        price_agg.avg_price_usd,
        last_before.price_usd
      )::numeric AS avg_price_usd
    FROM clip c
    -- time-weighted average over overlapping price intervals
    LEFT JOIN LATERAL (
  SELECT
    SUM(
      EXTRACT(EPOCH FROM (LEAST(ps.next_ts, c.seg_end) - GREATEST(ps.ts, c.seg_start)))
      * ps.price_usd::double precision
    ) / NULLIF(
      -- Dénominateur = durée avec des prix, pas durée totale du segment
      SUM(EXTRACT(EPOCH FROM (LEAST(ps.next_ts, c.seg_end) - GREATEST(ps.ts, c.seg_start)))),
      0
    ) AS avg_price_usd
  FROM (
    SELECT
      pf.timestamp AS ts,
      LEAD(pf.timestamp) OVER (PARTITION BY pf.price_source_id ORDER BY pf.timestamp) AS next_ts,
      pf.price_usd
    FROM points.price_feeds pf
    WHERE pf.price_source_id = c.price_source_id
      AND pf.timestamp < c.seg_end
  ) ps
  WHERE ps.next_ts IS NOT NULL
    AND ps.ts < c.seg_end
    AND ps.next_ts > c.seg_start
) AS price_agg ON true
    -- fast single-row probe for last price before seg_start (uses your covering index)
    LEFT JOIN LATERAL (
      SELECT NULLIF(pf2.price_usd, 0)::double precision AS price_usd
      FROM points.last_price_feeds pf2
      WHERE pf2.price_source_id = c.price_source_id
    ) AS last_before ON true
    WHERE c.seg_end > c.seg_start
  ),
  seg_with_mult AS (
    SELECT
      sp.*,
      COALESCE(boost_agg.boost_factor, 0.0) AS boost_factor
    FROM seg_price sp
    LEFT JOIN LATERAL (
      SELECT
        SUM(
          GREATEST(
            EXTRACT(EPOCH FROM (LEAST(COALESCE(ub.end_at, sp.seg_end), sp.seg_end)
                                 - GREATEST(ub.start_at, sp.seg_start))),
            0
          ) * (ub.multiplier - 1.0)
        ) / NULLIF(sp.seg_seconds, 0) AS boost_factor
      FROM points.user_boost ub
      WHERE ub.user_address = sp.user_address
        AND ub.start_at < sp.seg_end
        AND COALESCE(ub.end_at, sp.seg_end) > sp.seg_start
    ) AS boost_agg ON true
  )
  SELECT
    swm.lp_task_id,
    swm.task_id,
    swm.user_address,
    swm.token_address,
    swm.seg_start,
    swm.seg_end,
    (swm.seg_seconds / 3600.0)::double precision AS hours_in_seg,
    COALESCE(swm.amount, 0)                      AS amount,
    swm.point_rate,
    COALESCE(swm.avg_price_usd, 0)               AS avg_price_usd,
    -- base points
    ROUND(
      swm.point_rate
      * swm.seg_seconds
      * COALESCE(swm.amount, 0)
      * COALESCE(swm.avg_price_usd, 0)
    )::bigint                                        AS base_points,
    swm.boost_factor,
    -- booster points
    ROUND(
      (
        swm.point_rate
        * swm.seg_seconds
        * COALESCE(swm.amount, 0)
        * COALESCE(swm.avg_price_usd, 0)
      ) * swm.boost_factor
    )::bigint                                        AS booster_points,
    -- total points
    ROUND(
      (
        swm.point_rate
        * swm.seg_seconds
        * COALESCE(swm.amount, 0)
        * COALESCE(swm.avg_price_usd, 0)
      ) * (1 + swm.boost_factor)
    )::bigint                                        AS total_points,
    gf.godfather_id,
    COALESCE(gf.time_weight, 0.0)                 AS time_weight,
    CASE
      WHEN gf.godfather_id IS NOT NULL THEN
        ROUND(
          (
            swm.point_rate
            * swm.seg_seconds
            * COALESCE(swm.amount, 0)
            * COALESCE(swm.avg_price_usd, 0)
          ) * (1 + swm.boost_factor) * 0.10 * COALESCE(gf.time_weight, 0.0)
        )::bigint
      ELSE 0
    END                                           AS godfather_points
  FROM seg_with_mult swm
  LEFT JOIN points.user u
    ON u.address = swm.user_address
  -- choose a single referral record to avoid row multiplication:
  LEFT JOIN LATERAL (
    SELECT 
      ru.godfather_id,
      CASE 
        WHEN ru.used_at <= swm.seg_start THEN 1.0  -- Referral before segment start = full weight
        WHEN ru.used_at >= swm.seg_end THEN 0.0    -- Referral after segment end = no weight
        ELSE 
          -- Segment crosses referral: weight = (duration after referral) / (total duration)
          EXTRACT(EPOCH FROM (swm.seg_end - ru.used_at)) / 
          EXTRACT(EPOCH FROM (swm.seg_end - swm.seg_start))
      END AS time_weight
    FROM points.referral_usages ru
    WHERE ru.godson_id = u.id
      AND ru.used_at <= swm.seg_end
    ORDER BY ru.used_at ASC
    LIMIT 1
  ) AS gf ON true;
$$;