# 📆 Day 1 — Sun, 2025-01-05

## Actions

- **U1** (TASK1/TOKENA) `10:00–11:00`, **amount 1000**.
- **U2** (TASK1/TOKENA) `12:00–13:00`, **amount 500**.
- U3, U4: no actions.

## Calculations

- **TOKENA fallback @10–11**: last feed before 10:00 is **08:00 = $1.8**.
  → **U1/200001**: base `10 × 1h × 1000 × 1.8 = 18 000` pts; booster **0**.
- **TOKENA inside @12–13**: feed at **12:00 = $2.2** (in-segment).
  → **U2/200004**: base `10 × 1h × 500 × 2.2 = 11 000` pts; **boost_factor = 0.1** (×1.1-1.0); **booster = 1 100**.
- **U2 boost ×1.1** active from 00:00 onward.

---

# 📆 Day 2 — Mon, 2025-01-06

## Actions

- **U1** (TASK1/TOKENA) `10:00–11:00`, **amount 1500**.
- **U3** (TASK2/TOKENB) two tasks:
  - `14:00–15:00`, **amount 1000**.
  - `16:00–17:00`, **amount 900**, **boost ×2.0** during the full hour.
- **U2** opens long (TASK1/TOKENA) **from 08:00** onward, **amount 1000** (stays open).
- U4: no actions.

## Calculations

- **U1/200002 (TOKENA 10–11)**: fallback **08:00 = $2.8**.
  → base `10 × 1h × 1500 × 2.8 = 42 000` pts; booster **0**.
- **U3/200006 (TOKENB 14–15)**: fallback **12:00 = $5.9**.
  → base `15 × 1h × 1000 × 5.9 = 88 500` pts; booster **0**.
- **U3/200007 (TOKENB 16–17)**: in-segment feed **16:00 = $5.7**.
  → base `15 × 1h × 900 × 5.7 = 76 950` pts; **boost_factor = 1.0** (×2.0-1.0); **booster = 76 950**.
- **U2/200012 (TOKENA 08–24 open)**: in-segment feeds at 08, 12, 16, 20 → avg = **(2.8+3.2+2.7+3.3)/4 = $3.0**.
  → base `10 × 16h × 1000 × 3.0 = 480 000` pts; **boost_factor = 0.1** (×1.1-1.0); **booster = 48 000**.

---

# 📆 Day 3 — Tue, 2025-01-07

## Actions

- **U1** (TASK1/TOKENA) `10:00–11:00`, **amount 1000**.
- **U1** opens (TASK2/TOKENB) **from 14:00**, **amount 1500** (stays open).
- **U1** has **boost ×2.5** from 16:00–18:00 and **boost ×1.8** from 18:00–20:00 on TOKENB task.
- **U2** (TASK1/TOKENA) `12:00–13:00`, **amount 600**.
- **U2** keeps long open (TASK1/TOKENA) all day, **amount 1000**.
- **U4** (TASK2/TOKENB) `09:00–10:00`, **amount 1100**.
- U3: no actions.
- **Booster for U1**: ×2.5 from 16:00–18:00, ×1.8 from 18:00–20:00 on TOKENB task only.

## Calculations

- **U1/200003 (TOKENA 10–11)**: fallback **08:00 = $3.8**.
  → base `10 × 1h × 1000 × 3.8 = 38 000` pts; booster **0**.
- **U1/200010 (TOKENB 14–24 open segment today 10h)**: in-segment feeds **16:00 = $6.7**, **20:00 = $7.3** → avg **$7.0**.
  → Base: `15 × 10h × 1500 × 7.0 = 1 575 000` pts
  → **Boost factors**: ×2.5 from 16:00–18:00 (2h/10h × 1.5 = 0.3), ×1.8 from 18:00–20:00 (2h/10h × 0.8 = 0.16)
  → **Combined boost_factor = 0.46**; **booster = 724 500** pts
- **U2/200005 (TOKENA 12–13)**: in-segment feed **12:00 = $4.2**.
  → base `10 × 1h × 600 × 4.2 = 25 200` pts; **boost_factor = 0.1** (×1.1-1.0); **booster = 2 520**.
- **U2/200012 (TOKENA 00–24)**: day-avg **$4.0** (feeds at 00/04/08/12/16/20).
  → base `10 × 24h × 1000 × 4.0 = 960 000` pts; **boost_factor = 0.1** (×1.1-1.0); **booster = 96 000**.
- **U4/200008 (TOKENB 09–10)**: fallback **08:00 = $6.8**.
  → base `15 × 1h × 1100 × 6.8 = 112 200` pts; booster **0**.

---

# 📆 Day 4 — Wed, 2025-01-08

## Actions

- **U1** (TASK1/TOKENA) opens `10:00–…`, **amount 2000**.
- **U1** continues open (TASK2/TOKENB) all day (from yesterday 14:00), **amount 1500**.
- **U1** boosts from Day 3 (16:00–20:00) have ended; only the ×1.5 all-day boost applies.
- **U2** (TASK3/TOKENC) opens `12:00–…`, **amount 3000`** (**excluded**: unit = `vote`).
- **U2** continues open (TASK1/TOKENA) all day, **amount 1000**.
- **Booster**: **U1 has ×1.5** active all day.

## Calculations

_(No Jan 8 price feeds — everything uses fallback to the last price before the segment start.)_

- **U1/200010 (TOKENB 00–24)**: fallback **Jan 7 20:00 = $7.3**.
  → base `15 × 24h × 1500 × 7.3 = 3 942 000` pts; **boost_factor = 0.5** (×1.5-1.0); **booster = 1 971 000**.
- **U1/200009 (TOKENA 10–24, 14h)**: fallback **Jan 7 20:00 = $4.3**.
  → base `10 × 14h × 2000 × 4.3 = 1 204 000` pts; **boost_factor = 0.5** (×1.5-1.0); **booster = 602 000**.
- **U2/200011 (TOKENC 12–… )**: **ignored** (unit `vote`).
- **U2/200012 (TOKENA 00–24)**: fallback **Jan 7 20:00 = $4.3**.
  → base `10 × 24h × 1000 × 4.3 = 1 032 000` pts; **boost_factor = 0.1** (×1.1-1.0); **booster = 103 200**.

---

# 📊 **TOTAL CALCULATIONS (All Days: Jan 5-8, 2025)**

## Summary by User

### **User 1 (0xU1)**

| Task ID   | Description                | Base Points   | Booster Points | Total Points   |
| --------- | -------------------------- | ------------- | -------------- | -------------- |
| 200001    | Day 1: TOKENA 10-11h       | 18,000        | 0              | 18,000         |
| 200002    | Day 2: TOKENA 10-11h       | 42,000        | 0              | 42,000         |
| 200003    | Day 3: TOKENA 10-11h       | 38,000        | 0              | 38,000         |
| 200009    | Day 4: TOKENA 10-24h (14h) | 1,204,000     | 602,000        | 1,806,000      |
| 200010    | Day 3: TOKENB 14-24h (10h) | 1,575,000     | 724,500        | 2,299,500      |
| 200010    | Day 4: TOKENB 00-24h (24h) | 3,942,000     | 1,971,000      | 5,913,000      |
| **TOTAL** |                            | **6,819,000** | **3,297,500**  | **10,116,500** |

### **User 2 (0xU2)**

| Task ID   | Description                | Base Points              | Booster Points | Total Points  |
| --------- | -------------------------- | ------------------------ | -------------- | ------------- |
| 200004    | Day 1: TOKENA 12-13h       | 11,000                   | 1,100          | 12,100        |
| 200005    | Day 3: TOKENA 12-13h       | 25,200                   | 2,520          | 27,720        |
| 200011    | Day 4: TOKENC 12-24h       | **EXCLUDED** (unit=vote) |                |               |
| 200012    | Day 2: TOKENA 08-24h (16h) | 480,000                  | 48,000         | 528,000       |
| 200012    | Day 3: TOKENA 00-24h (24h) | 960,000                  | 96,000         | 1,056,000     |
| 200012    | Day 4: TOKENA 00-24h (24h) | 1,032,000                | 103,200        | 1,135,200     |
| **TOTAL** |                            | **2,508,200**            | **250,820**    | **2,759,020** |

### **User 3 (0xU3)**

| Task ID   | Description          | Base Points | Booster Points | Total Points |
| --------- | -------------------- | ----------- | -------------- | ------------ |
| 200006    | Day 2: TOKENB 14-15h | 88,500      | 0              | 88,500       |
| 200007    | Day 2: TOKENB 16-17h | 76,950      | 76,950         | 153,900      |
| **TOTAL** |                      | **165,450** | **76,950**     | **242,400**  |

### **User 4 (0xU4)**

| Task ID   | Description          | Base Points | Booster Points | Total Points |
| --------- | -------------------- | ----------- | -------------- | ------------ |
| 200008    | Day 3: TOKENB 09-10h | 112,200     | 0              | 112,200      |
| **TOTAL** |                      | **112,200** | **0**          | **112,200**  |

## 🎯 **GRAND TOTALS**

| User      | Base Points   | Booster Points | Total Points   | Percentage |
| --------- | ------------- | -------------- | -------------- | ---------- |
| **U1**    | 6,819,000     | 3,297,500      | **10,116,500** | **76.8%**  |
| **U2**    | 2,508,200     | 250,820        | **2,759,020**  | **20.9%**  |
| **U3**    | 165,450       | 76,950         | **242,400**    | **1.8%**   |
| **U4**    | 112,200       | 0              | **112,200**    | **0.9%**   |
| **TOTAL** | **9,604,850** | **3,625,270**  | **13,230,120** | **100%**   |

## 📈 **Key Insights**

- **Most Active**: U1 dominates with 76.8% of total points due to multiple long-duration tasks and significant boosters
- **Boost Effectiveness**: U1's boosters contribute 32.6% of their total points (3.3M/10.1M)
- **U2's Consistent Boost**: ×1.1 multiplier applied to all U2 tasks adds 250K+ bonus points
- **Token Distribution**:
  - TOKENA tasks: ~4.9M total points
  - TOKENB tasks: ~8.3M total points
  - TOKENC tasks: Excluded (vote unit)
- **Duration Impact**: Open tasks (200009, 200010, 200012) generate the highest point values
