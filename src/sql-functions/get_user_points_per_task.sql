-- Per-task totals reused by the updater
CREATE OR REPLACE FUNCTION points.get_user_points_per_task(
  start_at timestamptz,
  end_at   timestamptz
)
RETURNS TABLE (
  user_task_id    bigint,
  task_id         bigint,
  points          int,
  booster_points  int
)
LANGUAGE sql
AS $$
  SELECT
    d.user_task_id,
    d.task_id,
    SUM(d.base_points)::int     AS points,
    SUM(d.booster_points)::int  AS booster_points
  FROM points.get_user_points_details(start_at, end_at) d
  GROUP BY d.user_task_id, d.task_id;
$$;