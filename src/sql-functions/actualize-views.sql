CREATE MATERIALIZED VIEW IF NOT EXISTS points.view_leaderboard_lp AS
SELECT
  u.address AS user_address,
  (
    COALESCE(SUM(up.points), 0)
    + COALESCE(SUM(up.booster_points), 0)
    + COALESCE(u.lp_referral_points, 0)
  )::bigint AS pts
FROM "global"."user" AS u
LEFT JOIN points.lp_user_points AS up
  ON up.user_address = u.address
GROUP BY u.address, u.lp_referral_points;
REFRESH MATERIALIZED VIEW points.view_leaderboard_lp;



CREATE MATERIALIZED VIEW IF NOT EXISTS points.view_leaderboard_vote AS
SELECT
  u.address AS user_address,
  (
    COALESCE(SUM(vt.points), 0)
    + COALESCE(u.vote_referral_points, 0)
  )::bigint AS pts
FROM "global"."user" AS u
LEFT JOIN points.vote_user_tasks AS vt
  ON vt.user_address = u.address
GROUP BY u.address, u.vote_referral_points;
REFRESH MATERIALIZED VIEW points.view_leaderboard_vote;
