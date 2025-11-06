CREATE MATERIALIZED VIEW IF NOT EXISTS points.view_leaderboard_lp AS
SELECT
  "user_address",
  SUM(COALESCE("points", 0) + COALESCE("booster_points", 0)) AS pts
FROM points.lp_user_points 
GROUP BY "user_address"
ORDER BY pts DESC;
REFRESH MATERIALIZED VIEW points.view_leaderboard_lp;


CREATE MATERIALIZED VIEW IF NOT EXISTS points.view_leaderboard_vote AS
SELECT
  "user_address",
  SUM(COALESCE("points", 0)) AS pts
FROM points.vote_user_tasks
GROUP BY "user_address"
ORDER BY pts DESC;
REFRESH MATERIALIZED VIEW points.view_leaderboard_vote;