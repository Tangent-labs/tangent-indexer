# 🧮 Precise Points Calculation Rules — Time-Weighted Model

This document defines the rules for calculating user points exactly as implemented in the SQL function `points.get_user_points_details`. It incorporates segmentation, time-weighted pricing, and boost logic.

---

## 1. Entities

The calculation relies on the following key entities:

### User Task (`points.user_tasks`)

Represents a specific user's activity.

- `start`, `closed`: Defines the active task period. An open task has a NULL `closed` timestamp and runs until the query window ends.
- `amount`: The quantity of tokens or assets held. In the SQL, this is divided by `1e18` to normalize from its on-chain representation.

### Task Definition (`points.task`)

Describes the type of activity.

- `token_address`: The ERC20 token associated with the task (e.g., TOKENA, TOKENB).
- `point_rate`: The base multiplier for points, measured in points per second per USD.
  - Example: TASK1 (TOKENA) has 0.002778 pts/s/USD, TASK2 (TOKENB) has 0.004167 pts/s/USD.

### Price Feed (`points.price_feeds`)

Provides token prices over time.

- `token`, `timestamp`, `price_usd`
- Each feed defines a stepwise-constant price from its `timestamp` until the next feed for the same token.

### User Boost (`points.user_boost`)

Applies a point multiplier to a user's tasks for a given period.

- `start_at`, `end_at`: Defines the boost window. A NULL `end_at` indicates open-ended.
- `multiplier`: The factor by which base points are scaled (e.g., 1.5, 2.0).

### Referral Usage (`global.referral_usages`)

Defines referral relationships between users.

- `godfather_id`: The user ID of the referrer (who receives referral points).
- `godson_id`: The user ID of the referred user (who generates points for their referrer).
- `used_at`: The timestamp when the referral relationship was established.
- **Constraint**: Each user (`godson_id`) can only have one referrer (`godfather_id`).

---

## 2. Calculation Rules

Point calculation for a query window `[query_start, query_end)` proceeds in **segments**.

### 2.1 Segmentation

- A **segment** is the overlap of:
  - a user task’s lifetime `[task_start, task_closed)`, and
  - the query window `[query_start, query_end)`.
- Each segment is clipped at both ends to respect both boundaries.

---

### 2.2 Time-Weighted Average Price

For each segment:

1. Build **price steps**: each feed defines an interval `[pf.timestamp, next_pf.timestamp)` at `pf.price_usd`.
2. Clip each price step to the segment.
3. Compute a **time-weighted average**:

   $$
   avg\_price\_usd = \frac{\sum_i (price\_usd_i \times hours\_in\_overlap_i)}{total\_segment\_hours}
   $$

4. **Fallback rule**:
   - If _no_ price feed overlaps with the segment, use the **last known price strictly before seg_start**.
   - If _any_ feed overlaps, this fallback is **not applied** — even if the segment extends beyond the last available price feed.  
     → This means long open segments after the last feed are extended with the last price.

---

### 2.3 Base Points

Base points represent points earned without boosts:

$$
base\_points =
  point\_rate
  \times hours\_in\_seg
  \times amount
  \times avg\_price\_usd
$$

- In SQL, **`base_points` is rounded to the nearest integer**.

---

### 2.4 Boost Factor

For each boost overlapping the segment:

$$
boost\_factor = \sum \Bigg( \frac{overlap\_hours}{hours\_in\_seg} \times (multiplier - 1) \Bigg)
$$

- If no boosts overlap → `boost_factor = 0`.

---

### 2.5 Booster Points

$$
booster\_points = base\_points \times boost\_factor
$$

- In SQL, **`booster_points` is rounded to the nearest integer**.

---

### 2.6 Total Points

$$
total\_points = base\_points + booster\_points
$$

- In SQL, both `base_points` and `booster_points` are **independently rounded to int** before summing.

---

### 2.7 Referral Points (Godfather Points)

Referral points are awarded to referrers (godfathers) based on their referred users' (godsons') point earnings.

#### 2.7.1 Time Weight Factor

For each segment where a user has a referral relationship:

$$
time\_weight = \begin{cases}
1.0 & \text{if } referral\_used\_at \leq segment\_start \\
0.0 & \text{if } referral\_used\_at \geq segment\_end \\
\frac{segment\_end - referral\_used\_at}{segment\_end - segment\_start} & \text{if } segment\_start < referral\_used\_at < segment\_end
\end{cases}
$$

- **Full weight (1.0)**: If the referral was established before the segment started.
- **No weight (0.0)**: If the referral was established after the segment ended.
- **Partial weight**: If the referral was established during the segment, proportional to the time after the referral.

#### 2.7.2 Godfather Points Calculation

$$
godfather\_points = \begin{cases}
\text{ROUND}\left((base\_points + booster\_points) \times 0.10 \times time\_weight\right) & \text{if godfather exists} \\
0 & \text{otherwise}
\end{cases}
$$

Where:

- `base_points + booster_points` is the total points earned by the godson for this segment
- `0.10` is the 10% referral commission rate
- `time_weight` accounts for when the referral relationship was established
- The result is **rounded to the nearest integer**

#### 2.7.3 Referral Selection Rules

- Each user can have **at most one active referrer** at any time
- If multiple referral records exist, only the **earliest one** (`ORDER BY used_at ASC LIMIT 1`) that overlaps with the segment is used
- Only referrals established before or during the segment end (`used_at <= segment_end`) are considered

---

## 3. Edge Cases

- **Zero or NULL amount** → `base_points = booster_points = total_points = godfather_points = 0`.
- **Inactive tasks** (`is_active = FALSE`) → ignored.
- **Boosts with NULL end_at** → treated as active until segment end.
- **Missing price feeds** → apply fallback rule.
- **No referral relationship** → `godfather_points = 0`.
- **Multiple referrals** → only the earliest referral record is used.
- **Referral after segment** → `time_weight = 0`, resulting in `godfather_points = 0`.

---

## 4. Summary of Key Behaviors

- Segments are clipped to task + query boundaries.
- Prices are time-weighted **only for overlapping feeds**.  
  Long segments that extend beyond the last feed are extended — no fallback is used if there is any overlap.
- Base and booster are **rounded separately** before total.
- Boost factors are proportional to time overlaps, additive if multiple boosts overlap.
- **Referral points** are calculated for godfathers based on their godsons' earnings with:
  - 10% commission rate on total points (base + booster)
  - Time-weighted based on when the referral relationship was established
  - Only one referrer per user (earliest referral record used)
  - Rounded to nearest integer separately from other point calculations
