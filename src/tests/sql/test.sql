

----------------------------------
-- FIRST RUN processPointSeed.sql
----------------------------------


-- Day 1: January 5th, 2025
SELECT points.insert_missing_user_points();
SELECT points.compute_user_points(
  '2025-01-05 00:00:00+00'::timestamptz,
  '2025-01-06 00:00:00+00'::timestamptz
);
select * from points.user_points;

-- Day 2: January 6th, 2025
SELECT points.insert_missing_user_points();
SELECT points.compute_user_points(
  '2025-01-06 00:00:00+00'::timestamptz,
  '2025-01-07 00:00:00+00'::timestamptz
);
select * from points.user_points;
-- Day 3: January 7th, 2025

SELECT points.insert_missing_user_points();
SELECT points.compute_user_points(
  '2025-01-07 00:00:00+00'::timestamptz,
  '2025-01-08 00:00:00+00'::timestamptz
);
  SELECT points.get_user_points_details('2025-01-07 00:00:00+00'::timestamptz,
     '2025-01-08 00:00:00+00'::timestamptz);
select * from points.user_points;

 -- Day 4: January 8th, 2025
   SELECT points.insert_missing_user_points();

   SELECT points.compute_user_points(
     '2025-01-08 00:00:00+00'::timestamptz,
     '2025-01-09 00:00:00+00'::timestamptz
   );
   select * from points.user_points;


--- TOTAL
   SELECT points.insert_missing_user_points();
SELECT points.get_user_points_details('2025-01-05 00:00:00+00'::timestamptz,
     '2025-01-09 00:00:00+00'::timestamptz);



select points.compute_godfather_points();
select * from global.user;
-- Stored procedure to update points.user_points based on task time, token USD price and point_rate
-- This procedure computes base points and booster points for user tasks within a given time window





