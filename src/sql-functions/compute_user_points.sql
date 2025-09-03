CREATE OR REPLACE FUNCTION points.compute_user_points(
  start_at timestamptz,
  end_at timestamptz
)
RETURNS void
LANGUAGE sql
AS $$

    SELECT points.insert_missing_user_points();

    UPDATE points.user_points up
    SET
      points         =  up.points + pt.points ,
      booster_points =  up.booster_points + pt.booster_points
    FROM points.get_user_points_per_task(start_at, end_at) pt
    WHERE up.user_address = pt.user_address
      AND up.task_id      = pt.task_id;


$$;