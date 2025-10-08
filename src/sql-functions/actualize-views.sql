  
CREATE VIEW points.view_leaderboard_lp AS  
SELECT "user_address", SUM(COALESCE("points", 0)) as pts FROM "points"."lp_user_points"
GROUP BY "user_address"
ORDER BY pts DESC;

  
  
CREATE VIEW points.view_leaderboard_vote AS  
SELECT "user_address", SUM(COALESCE("points", 0)) as pts FROM "points"."vote_user_tasks"
GROUP BY "user_address"
ORDER BY pts DESC;