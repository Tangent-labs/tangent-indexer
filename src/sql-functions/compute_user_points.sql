CREATE OR REPLACE FUNCTION points.compute_user_points(
  start_at timestamp,
  end_at timestamp
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM points.insert_missing_user_points();

  UPDATE points.lp_user_points up
  SET
    points         =  up.points + pt.points,
    booster_points =  up.booster_points + pt.booster_points
  FROM points.get_user_points_per_task(start_at, end_at) pt
  WHERE up.user_address = pt.user_address
    AND up.task_id      = pt.task_id;

  UPDATE points.user g
  SET lp_referral_points = g.lp_referral_points + agg.gdfp
  FROM (
    SELECT godfather_id, SUM(godfather_points) AS gdfp
    FROM points.get_user_points_per_task(start_at, end_at)
    GROUP BY godfather_id
  ) AS agg
  WHERE g.id = agg.godfather_id;
END;
$$;