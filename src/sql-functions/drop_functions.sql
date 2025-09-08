
drop function  if exists  points.insert_missing_user_points();
drop function   if exists points.get_user_points_details(timestamp,timestamp);
drop function   if exists points.get_user_points_details(timestamptz,timestamptz);
drop function  if exists points.get_user_points_per_task(timestamp,timestamp);
drop function  if exists points.get_user_points_per_task(timestamptz,timestamptz);
drop function  if exists points.compute_user_points(timestamp,timestamp);
drop function  if exists points.compute_user_points(timestamptz,timestamptz);
drop function  if exists points.compute_godfather_points();