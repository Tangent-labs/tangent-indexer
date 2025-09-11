-- Per-task totals reused by the updater
CREATE OR REPLACE FUNCTION points.get_user_points_per_task(
  start_at timestamp,
  end_at   timestamp
)
RETURNS TABLE (
  user_address    varchar,
  task_id         bigint,
  points          int,
  booster_points  int,
  godfather_id    bigint,
  godfather_points int
)
LANGUAGE sql
AS $$
  SELECT
    d.user_address,
    d.task_id,
    SUM(d.base_points)::int     AS points,
    SUM(d.booster_points)::int  AS booster_points,
    d.godfather_id,
    SUM(d.godfather_points)::int AS godfather_points
  FROM points.get_user_points_details(start_at, end_at) d
  GROUP BY d.user_address, d.task_id, d.godfather_id;
$$;