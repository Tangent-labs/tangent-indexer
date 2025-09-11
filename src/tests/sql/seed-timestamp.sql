



DELETE from points.user_tasks where id  in (965, 969,976);
DELETE from points.user_points where user_address ='0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
DELETE from points.task where id = 358;
DELETE from points.price_feeds where  token ='0x6d7efb67236a2005ec704bf5dd55dd0703c4';
DELETE from global.user where address ='0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

insert into global.user (id, address, onboarded, code, referral_points)
values (1,'0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',True,'',0);
INSERT INTO points.tracked_erc20 (address, name, symbol)
VALUES ('0x6d7efb67236a2005ec704bf5dd55dd0703c4','USG','USG')
ON CONFLICT (address) DO NOTHING;

INSERT INTO points.task (id, protocol, action_type, description, name, token_address, point_rate, is_active, url)
VALUES (358,'tangent','hold','Hold USG token','HOLD_USG','0x6d7efb67236a2005ec704bf5dd55dd0703c4',0.00417,TRUE,'https://tangent.fi')
ON CONFLICT (id) DO NOTHING;

-- Minimal price feeds around the period for determinism
INSERT INTO points.price_feeds (token, timestamp, price_usd)
VALUES
  ('0x6d7efb67236a2005ec704bf5dd55dd0703c4','2025-08-26 00:00:00','1.0'),
  ('0x6d7efb67236a2005ec704bf5dd55dd0703c4','2025-08-27 00:00:00','1.0');

-- Insert the three rows
INSERT INTO points.user_tasks (id, task_id, user_address, start, closed, amount) VALUES
  (965, 358, '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', '2025-08-27 04:31:33+00', '2025-08-27 04:31:47', '5000000000000000000000'),
  (969, 358, '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', '2025-08-27 04:36:55+00', '2025-08-27 04:51:04', '4000000000000000000000'),
  (976, 358, '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', '2025-08-27 04:51:04+00', NULL, '5000000000000000000000')
ON CONFLICT (id) DO NOTHING;




SELECT 'UTC', *
FROM points.get_user_points_details(
  (to_timestamp(1756268975) AT TIME ZONE 'UTC')::timestamp,
  (to_timestamp(1756270523)  AT TIME ZONE 'UTC')::timestamp
)
UNION ALL
SELECT 'NO UTC', *
FROM points.get_user_points_details(
  (to_timestamp('1756268975'))::timestamp,
  (to_timestamp('1756270523'))::timestamp
);

-- select points.compute_user_points((to_timestamp('1756268975'))::timestamp,  (to_timestamp('1756270523'))::timestamp);

select * from points.user_points;

