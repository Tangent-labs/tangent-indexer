-- Clean old test data

DELETE FROM points.user_boost
WHERE user_address IN ('0xU1','0xU2','0xU3','0xU4');

DELETE FROM points.user_points
WHERE user_address IN ('0xU1','0xU2','0xU3','0xU4');

DELETE FROM points.user_tasks
WHERE user_address IN ('0xU1','0xU2','0xU3','0xU4');

DELETE FROM points.task
WHERE id IN (101,102,103);

DELETE FROM points.price_feeds
WHERE token IN ('TOKENA','TOKENB')
  AND timestamp >= '2025-01-05 00:00:00+00'
  AND timestamp <  '2025-01-08 00:00:00+00';

DELETE FROM points.tracked_erc20
WHERE address IN ('TOKENA', 'TOKENB', 'TOKENC');

DELETE FROM points.referral_usages WHERE godfather_id IN (10,20,30,40) OR godson_id IN (10,20,30,40);

DELETE FROM points.user where address in ('0xU1','0xU2','0xU3','0xU4');

--- INSERT TEST DATA ---------------- 

INSERT INTO points.tracked_erc20 (id, address, name, symbol) VALUES
    (100001, 'TOKENA', 'Token A', 'TKNA'),
    (100002, 'TOKENB', 'Token B', 'TKNB'), 
    (100003, 'TOKENC', 'Token C', 'TKNC');

-- Create test users
INSERT INTO points.user (id,address, onboarded, referral_points) VALUES
    (10,'0xU1', FALSE, 0),
    (20,'0xU2', FALSE, 0),
    (30,'0xU3', FALSE, 0),
    (40,'0xU4', FALSE, 0);

-- Two tasks
INSERT INTO points.task (id,protocol,action_type,description, name,token_address, point_rate, is_active,url) VALUES
  (101,'proto', 'hold',  'd1','TASK1','TOKENA', 0.002778, TRUE,'https://1'),
  (102,'proto','hold', 'd2', 'TASK2','TOKENB', 0.004167, TRUE,'https://2'),
  (103,'proto','hold',  'd3','TASK3','TOKENC', 0.005556, TRUE,'https://3');

-- Price feeds every 4h
-- TOKENA: 2 / 3 / 4
INSERT INTO points.price_feeds (token, timestamp, price_usd) VALUES
  -- Day1  => AVG 2 
  ('TOKENA','2025-01-05 00:00+00','1.9'),('TOKENA','2025-01-05 04:00+00','2.1'),
  ('TOKENA','2025-01-05 08:00+00','1.8'),('TOKENA','2025-01-05 12:00+00','2.2'),
  ('TOKENA','2025-01-05 16:00+00','1.7'),('TOKENA','2025-01-05 20:00+00','2.3'),
  -- Day2 => AVG 3  
  ('TOKENA','2025-01-06 00:00+00','2.9'),('TOKENA','2025-01-06 04:00+00','3.1'),
  ('TOKENA','2025-01-06 08:00+00','2.8'),('TOKENA','2025-01-06 12:00+00','3.2'),
  ('TOKENA','2025-01-06 16:00+00','2.7'),('TOKENA','2025-01-06 20:00+00','3.3'),
  -- Day3 => AVG 4 
  ('TOKENA','2025-01-07 00:00+00','3.9'),('TOKENA','2025-01-07 04:00+00','4.1'),
  ('TOKENA','2025-01-07 08:00+00','3.8'),('TOKENA','2025-01-07 12:00+00','4.2'),
  ('TOKENA','2025-01-07 16:00+00','3.7'),('TOKENA','2025-01-07 20:00+00','4.3');

-- TOKENB: 5 / 6 / 7
INSERT INTO points.price_feeds (token, timestamp, price_usd) VALUES
  -- Day1
  ('TOKENB','2025-01-05 00:00+00','4.8'),('TOKENB','2025-01-05 04:00+00','5.2'),
  ('TOKENB','2025-01-05 08:00+00','4.9'),('TOKENB','2025-01-05 12:00+00','5.1'),
  ('TOKENB','2025-01-05 16:00+00','4.7'),('TOKENB','2025-01-05 20:00+00','5.3'),
  -- Day2 => AVG 6 
  ('TOKENB','2025-01-06 00:00+00','5.9'),('TOKENB','2025-01-06 04:00+00','6.1'),
  ('TOKENB','2025-01-06 08:00+00','5.8'),('TOKENB','2025-01-06 12:00+00','5.9'),
  ('TOKENB','2025-01-06 16:00+00','5.7'),('TOKENB','2025-01-06 20:00+00','5.8'),
  -- Day3 => AVG 7 
  ('TOKENB','2025-01-07 00:00+00','6.9'),('TOKENB','2025-01-07 04:00+00','7.1'),
  ('TOKENB','2025-01-07 08:00+00','6.8'),('TOKENB','2025-01-07 12:00+00','7.2'),
  ('TOKENB','2025-01-07 16:00+00','6.7'),('TOKENB','2025-01-07 20:00+00','7.3');

-- User tasks
-- U1: three days on TOKENA (task_id = 101)
INSERT INTO points.user_tasks (id, task_id, user_address, start, closed, amount) VALUES
  (200001,101,'0xU1','2025-01-05 10:00+00','2025-01-05 11:00+00','1000000000000000000000'),
  (200002,101,'0xU1','2025-01-06 10:00+00','2025-01-06 11:00+00','1500000000000000000000'),
  (200003,101,'0xU1','2025-01-07 10:00+00','2025-01-07 11:00+00','1000000000000000000000');

-- U2: two days on TOKENA (task_id = 101)
INSERT INTO points.user_tasks (id, task_id, user_address, start, closed, amount) VALUES
  (200004,101,'0xU2','2025-01-05 12:00+00','2025-01-05 13:00+00','500000000000000000000'),
  (200005,101,'0xU2','2025-01-07 12:00+00','2025-01-07 13:00+00','600000000000000000000');

-- U3: two tasks same day (TOKENB, Day2), second boosted (task_id = 102)
INSERT INTO points.user_tasks (id, task_id, user_address, start, closed, amount) VALUES
  (200006,102,'0xU3','2025-01-06 14:00+00','2025-01-06 15:00+00','1000000000000000000000'),
  (200007,102,'0xU3','2025-01-06 16:00+00','2025-01-06 17:00+00','900000000000000000000');

-- U4: single task on TOKENB, Day3 (task_id = 102)
INSERT INTO points.user_tasks (id, task_id, user_address, start, closed, amount) VALUES
  (200008,102,'0xU4','2025-01-07 09:00+00','2025-01-07 10:00+00','1100000000000000000000');

-- Open tasks (not closed) for User 1 and User 2
INSERT INTO points.user_tasks (id, task_id, user_address, start, closed, amount) VALUES
  -- U1: open task on TOKENA started today
  (200009,101,'0xU1','2025-01-08 10:00+00',NULL,'2000000000000000000000'),
  -- U1: open task on TOKENB started yesterday  
  (200010,102,'0xU1','2025-01-07 14:00+00',NULL,'1500000000000000000000'),
  -- U2: open task on TOKENC started today
  (200011,103,'0xU2','2025-01-08 12:00+00',NULL,'3000000000000000000000'),
  -- U2: open task on TOKENA started 2 days ago
  (200012,101,'0xU2','2025-01-06 08:00+00',NULL,'1000000000000000000000');

-- Add the crossing segment task 299999 for godfather testing
INSERT INTO points.user_tasks (id, task_id, user_address, start, closed, amount) VALUES
  (299999,101,'0xU1','2025-01-05 09:00+00','2025-01-05 11:00+00','500000000000000000000');


-- Booster: U3, second task Day2 (×2.0 during 16:00-17:00 on 2025-01-06)
INSERT INTO points.user_boost (user_address, start_at, end_at, multiplier) VALUES
  ('0xU3','2025-01-06 16:00+00','2025-01-06 17:00+00',2.0),
  -- U1 all-day boost on Day 4 (×1.5)
  ('0xU1','2025-01-08 00:00+00','2025-01-09 00:00+00',1.5),
  -- U1 boost ×2.5 from 16:00-18:00 on Day 3
  ('0xU1','2025-01-07 16:00+00','2025-01-07 18:00+00',2.5),
  -- U1 boost ×1.8 from 18:00-20:00 on Day 3  
  ('0xU1','2025-01-07 18:00+00','2025-01-07 20:00+00',1.8),
  -- U1 boost ×1.8 from 18:00-20:00 on Day 3  
  ('0xU2','2025-01-05 00:00+00',null,1.1)
  ;


-- Godfather: U2 -> U1
INSERT INTO points.referral_usages (godfather_id, godson_id,used_at)
VALUES (20,10,'2025-01-05 10:00+00');





