CREATE OR REPLACE FUNCTION points.insert_missing_user_points()
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO points.user_points (task_id, user_address, points, booster_points)
  SELECT DISTINCT ut.task_id, ut.user_address, 0, 0
  FROM points.user_tasks ut
  ON CONFLICT (task_id, user_address) DO NOTHING;
$$;