CREATE OR REPLACE FUNCTION points.compute_godfather_points()
RETURNS void
LANGUAGE sql
AS $$
  /* Recompute referral_points for every user:
     - direct referrals only (global.referral_usages)
     - 10% of (points + booster_points)
  */
  UPDATE global."user" g
  SET referral_points = COALESCE(FLOOR(0.10 * t.total_points)::bigint, 0)
  FROM (
    SELECT g2.id,
           COALESCE(SUM(COALESCE(p.points,0) + COALESCE(p.booster_points,0)), 0) AS total_points
    FROM global."user" g2
    LEFT JOIN global.referral_usages r  ON r.godfather_id = g2.id
    LEFT JOIN global."user" u          ON u.id = r.godson_id
    LEFT JOIN points.user_points p     ON p.user_address = u.address
    GROUP BY g2.id
  ) AS t
  WHERE g.id = t.id;
$$;
