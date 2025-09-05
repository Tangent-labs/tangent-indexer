# 📆 Day 1 — Sun, 2025-01-05

## Actions

- **U1** (TASK1/TOKENA) 10:00–11:00, amount 1000
- **U2** (TASK1/TOKENA) 12:00–13:00, amount 500
- **U3, U4**: no actions

## Calculations

- **TOKENA fallback @10–11**: last feed before 10:00 is 08:00 = $1.8
  - → U1/200001: base `0.002778 × 3600s × 1000 × 1.8 = 18,001` pts; booster 0
- **TOKENA inside @12–13**: feed at 12:00 = $2.2 (in-segment)
  - → U2/200004: base `0.002778 × 3600s × 500 × 2.2 = 11,001` pts; boost_factor = 0.1 (×1.1-1.0); booster = 1,100
- **U2 boost ×1.1** active from 00:00 onward

# 📆 Day 2 — Mon, 2025-01-06

## Actions

- **U1** (TASK1/TOKENA) 10:00–11:00, amount 1500
- **U3** (TASK2/TOKENB) two tasks:
  - 14:00–15:00, amount 1000
  - 16:00–17:00, amount 900, boost ×2.0 during the full hour
- **U2** opens long (TASK1/TOKENA) from 08:00 onward, amount 1000 (stays open)
- **U4**: no actions

## Calculations

- **U1/200002** (TOKENA 10–11): fallback 08:00 = $2.8
  - → base `0.002778 × 3600s × 1500 × 2.8 = 42,003` pts; booster 0
- **U3/200006** (TOKENB 14–15): fallback 12:00 = $5.9
  - → base `0.004167 × 3600s × 1000 × 5.9 = 88,501` pts; booster 0
- **U3/200007** (TOKENB 16–17): in-segment feed 16:00 = $5.7
  - → base `0.004167 × 3600s × 900 × 5.7 = 76,956` pts; boost_factor = 1.0 (×2.0-1.0); booster = 76,956
- **U2/200012** (TOKENA 08–24 open): in-segment feeds at 08, 12, 16, 20 → time-weighted avg = $3.0
  - → base `0.002778 × 57600s × 1000 × 3.0 = 480,000` pts; boost_factor = 0.1 (×1.1-1.0); booster = 48,000

# 📆 Day 3 — Tue, 2025-01-07

## Actions

- **U1** (TASK1/TOKENA) 10:00–11:00, amount 1000
- **U1** opens (TASK2/TOKENB) from 14:00, amount 1500 (stays open)
- **U1** has boost ×2.5 from 16:00–18:00 and boost ×1.8 from 18:00–20:00 on TOKENB task
- **U2** (TASK1/TOKENA) 12:00–13:00, amount 600
- **U2** keeps long open (TASK1/TOKENA) all day, amount 1000
- **U4** (TASK2/TOKENB) 09:00–10:00, amount 1100
- **U3**: no actions

## Calculations

- **U1/200003** (TOKENA 10–11): fallback 08:00 = $3.8
  - → base `0.002778 × 3600s × 1000 × 3.8 = 38,003` pts; booster 0
- **U1/200010** (TOKENB 14–24 open segment today 10h): in-segment feeds 16:00 = $6.7, 20:00 = $7.3 → time-weighted avg = $7.04
  - → Base: `0.004167 × 36000s × 1500 × 7.04 = 1,580,249` pts
  - → **Boost factors**: ×2.5 from 16:00–18:00 (2h/10h × 1.5 = 0.3), ×1.8 from 18:00–20:00 (2h/10h × 0.8 = 0.16)
  - → **Combined boost_factor = 0.46**; booster = 726,915 pts
  - → **Total = 2,307,164**
- **U2/200005** (TOKENA 12–13): in-segment feed 12:00 = $4.2
  - → base `0.002778 × 3600s × 600 × 4.2 = 25,200` pts; boost_factor = 0.1 (×1.1-1.0); booster = 2,520
- **U2/200012** (TOKENA 00–24): day-avg $4.0 (time-weighted from feeds at 00/04/08/12/16/20)
  - → base `0.002778 × 86400s × 1000 × 4.0 = 960,000` pts; boost_factor = 0.1 (×1.1-1.0); booster = 96,000
- **U4/200008** (TOKENB 09–10): fallback 08:00 = $6.8
  - → base `0.004167 × 3600s × 1100 × 6.8 = 112,201` pts; booster 0

# 📆 Day 4 — Wed, 2025-01-08

## Actions

- **U1** (TASK1/TOKENA) opens 10:00–…, amount 2000
- **U1** continues open (TASK2/TOKENB) all day (from yesterday 14:00), amount 1500
- **U1** boosts from Day 3 (16:00–20:00) have ended; only the ×1.5 all-day boost applies
- **U2** (TASK3/TOKENC) opens 12:00–…, amount 3000 (excluded: unit = vote)
- **U2** continues open (TASK1/TOKENA) all day, amount 1000
- **Booster**: U1 has ×1.5 active all day

## Calculations

_(No Jan 8 price feeds — everything uses fallback to the last price before the segment start.)_

- **U1/200010** (TOKENB 00–24): fallback Jan 7 20:00 = $7.3
  - → base `0.004167 × 86400s × 1500 × 7.3 = 3,942,315` pts; boost_factor = 0.5 (×1.5-1.0); booster = 1,971,158
- **U1/200009** (TOKENA 10–24, 14h): fallback Jan 7 20:00 = $4.3
  - → base `0.002778 × 50400s × 2000 × 4.3 = 1,204,109` pts; boost_factor = 0.5 (×1.5-1.0); booster = 602,055
- **U2/200011** (TOKENC 12–…): ignored (unit vote)
- **U2/200012** (TOKENA 00–24): fallback Jan 7 20:00 = $4.3
  - → base `0.002778 × 86400s × 1000 × 4.3 = 1,032,082` pts; boost_factor = 0.1 (×1.1-1.0); booster = 103,208

---

# 📊 TOTAL CALCULATIONS (All Days: Jan 5-8, 2025)

## Summary by User

### **User 1 (0xU1)**

| Task ID   | Description                     | Base Points   | Booster Points | Total Points   |
| --------- | ------------------------------- | ------------- | -------------- | -------------- |
| 200001    | Day 1: TOKENA 10-11h            | 18,001        | 0              | 18,001         |
| 200002    | Day 2: TOKENA 10-11h            | 42,003        | 0              | 42,003         |
| 200003    | Day 3: TOKENA 10-11h            | 38,003        | 0              | 38,003         |
| 200009    | Day 4: TOKENA 10-24h (14h)      | 1,204,109     | 602,055        | 1,806,164      |
| 200010    | Day 3: TOKENB 14-24h (10h)      | 1,580,249     | 726,915        | 2,307,164      |
| 200010    | Day 4: TOKENB 00-24h (24h)      | 3,942,315     | 1,971,158      | 5,913,473      |
| 299999    | Test: TOKENA 09-11h (cross-ref) | 18,000        | 0              | 18,000         |
| **TOTAL** |                                 | **6,842,680** | **3,300,128**  | **10,142,808** |

### **User 2 (0xU2)**

| Task ID   | Description                | Base Points          | Booster Points | Total Points  |
| --------- | -------------------------- | -------------------- | -------------- | ------------- |
| 200004    | Day 1: TOKENA 12-13h       | 11,001               | 1,100          | 12,101        |
| 200005    | Day 3: TOKENA 12-13h       | 25,200               | 2,520          | 27,720        |
| 200011    | Day 4: TOKENC 12-24h       | EXCLUDED (unit=vote) | -              | -             |
| 200012    | Day 2: TOKENA 08-24h (16h) | 480,000              | 48,000         | 528,000       |
| 200012    | Day 3: TOKENA 00-24h (24h) | 960,000              | 96,000         | 1,056,000     |
| 200012    | Day 4: TOKENA 00-24h (24h) | 1,032,082            | 103,208        | 1,135,290     |
| **TOTAL** |                            | **2,508,283**        | **250,828**    | **2,759,111** |

### **User 3 (0xU3)**

| Task ID   | Description          | Base Points | Booster Points | Total Points |
| --------- | -------------------- | ----------- | -------------- | ------------ |
| 200006    | Day 2: TOKENB 14-15h | 88,501      | 0              | 88,501       |
| 200007    | Day 2: TOKENB 16-17h | 76,956      | 76,956         | 153,912      |
| **TOTAL** |                      | **165,457** | **76,956**     | **242,413**  |

### **User 4 (0xU4)**

| Task ID   | Description          | Base Points | Booster Points | Total Points |
| --------- | -------------------- | ----------- | -------------- | ------------ |
| 200008    | Day 3: TOKENB 09-10h | 112,201     | 0              | 112,201      |
| **TOTAL** |                      | **112,201** | **0**          | **112,201**  |

---

## 🎯 **GRAND TOTALS**

| User      | Base Points   | Booster Points | Total Points   | Percentage |
| --------- | ------------- | -------------- | -------------- | ---------- |
| **U1**    | 6,842,680     | 3,300,128      | **10,142,808** | 76.5%      |
| **U2**    | 2,508,283     | 250,828        | **2,759,111**  | 20.8%      |
| **U3**    | 165,457       | 76,956         | **242,413**    | 1.8%       |
| **U4**    | 112,201       | 0              | **112,201**    | 0.8%       |
| **TOTAL** | **9,628,621** | **3,627,912**  | **13,256,533** | 100%       |

---

## 🎯 **GODFATHER (REFERRAL) CALCULATIONS**

### **Referral Setup**

- **Godfather**: U2 (user_id=20, address='0xU2')
- **Godson**: U1 (user_id=10, address='0xU1')
- **Referral Established**: 2025-01-05 10:00:00 UTC
- **Commission Rate**: 10% of godson's total points (base + booster)

### **Time Weight Calculation Rules**

For each U1 segment, the time weight is calculated as:

```
time_weight = {
  1.0                                     if referral_used_at <= segment_start
  0.0                                     if referral_used_at >= segment_end
  (segment_end - referral_used_at) /      if segment_start < referral_used_at < segment_end
  (segment_end - segment_start)
}
```

### **U1 Segments with Godfather Points**

| Task ID | Description          | Seg Start        | Seg End          | Time Weight | U1 Total Points | U2 Godfather Points |
| ------- | -------------------- | ---------------- | ---------------- | ----------- | --------------- | ------------------- |
| 200001  | Day 1: TOKENA 10-11h | 2025-01-05 10:00 | 2025-01-05 11:00 | 1.0         | 18,001          | 1,800               |
| 299999  | Test: TOKENA 09-11h  | 2025-01-05 09:00 | 2025-01-05 11:00 | 0.5         | 18,000          | 900                 |
| 200002  | Day 2: TOKENA 10-11h | 2025-01-06 10:00 | 2025-01-06 11:00 | 1.0         | 42,003          | 4,200               |
| 200003  | Day 3: TOKENA 10-11h | 2025-01-07 10:00 | 2025-01-07 11:00 | 1.0         | 38,003          | 3,800               |
| 200009  | Day 4: TOKENA 10-24h | 2025-01-08 10:00 | 2025-01-09 00:00 | 1.0         | 1,806,164       | 180,616             |
| 200010  | Day 3: TOKENB 14-24h | 2025-01-07 14:00 | 2025-01-08 00:00 | 1.0         | 2,307,164       | 230,716             |
| 200010  | Day 4: TOKENB 00-24h | 2025-01-08 00:00 | 2025-01-09 00:00 | 1.0         | 5,913,473       | 591,347             |

**Task 299999** is a special test case that crosses the referral boundary:

- Segment: 09:00-11:00 (2 hours total)
- Referral established: 10:00 (1 hour into segment)
- Time after referral: 1 hour out of 2 hours = 0.5 time_weight
- Base calculation: `0.002778 × 7200s × 500 × $1.8 = 18,000` base points (2 hours, 500 tokens, $1.8 fallback price)
- Godfather points = `18,000 × 0.10 × 0.5 = 900`

### **U2 Total Referral Points**

```
U2 Referral Points = Σ(U1_segment_total_points × 0.10 × time_weight)
                  = 1,800 + 900 + 4,200 + 3,800 + 180,616 + 230,716 + 591,347
                  = 1,013,379 points
```

### **Key Referral Test Cases**

1. **Full Weight (1.0)**: All U1 segments starting at or after referral time get full 10% commission
2. **Partial Weight (0.5)**: Task 299999 spanning referral gets proportional commission (50%)
3. **No Commission**: U2, U3, U4 have no godfather, so their godfather_points = 0
4. **Consistency**: U1 shows godfather_id=20 in all segments after referral establishment

---

## 📈 **Key Insights (time-weighted version)**

- **Most Active**: U1 dominates with ~10.1M points (76.5% of total)
- **Boost Effectiveness**: U1's boosters add ~32.6% (3.3M/10.1M) to their base points
- **U2's moderate boost**: contributes ~251K points through consistent 10% boost periods
- **Open tasks** generate the highest values due to extended durations with fallback pricing
- **Referral Impact**: U2 earns ~1.01M referral points (10% of U1's ~10.1M points), demonstrating effective godfather system
- **Cross-boundary testing**: Task 299999 validates partial time-weight calculations for referrals
