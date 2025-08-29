CREATE OR REPLACE FUNCTION points.insert_missing_user_points()
RETURNS void
LANGUAGE sql
AS $$
  -- insert  rows  that do not exists in user_points but are in user_tasks
  INSERT INTO points.user_points (user_task_id, task_id, user_address, points, booster_points)
  SELECT ut.id, ut.task_id, ut.user_address, 0, 0
  FROM points.user_tasks ut
  LEFT JOIN points.user_points up
    ON up.user_task_id = ut.id
  WHERE up.user_task_id IS NULL;
$$;
