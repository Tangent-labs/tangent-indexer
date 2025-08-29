# 📆 Day 1 — Sun, 2025-01-05

## Actions

- **U1** (TASK1/TOKENA) `10:00–11:00`, **amount 1000**.
- **U2** (TASK1/TOKENA) `12:00–13:00`, **amount 500**.
- U3, U4: no actions.

## Calculations

- **TOKENA fallback @10–11**: last feed before 10:00 is **08:00 = $1.8**.
  → **U1/200001**: `10 × 1h × 1000 × 1.8 = 18 000` pts.
- **TOKENA inside @12–13**: feed at **12:00 = $2.2** (in-segment).
  → **U2/200004**: `10 × 1h × 500 × 2.2 = 11 000` pts.
- No boosters active.

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
  → `10 × 1h × 1500 × 2.8 = 42 000` pts.
- **U3/200006 (TOKENB 14–15)**: fallback **12:00 = $5.9**.
  → `15 × 1h × 1000 × 5.9 = 88 500` pts; booster **0**.
- **U3/200007 (TOKENB 16–17)**: in-segment feed **16:00 = $5.7**.
  → base `15 × 1h × 900 × 5.7 = 76 950` pts; **booster = +76 950** (×2.0 full hour).
- **U2/200012 (TOKENA 08–24 open)**: in-segment feeds at 08, 12, 16, 20 → avg = **(2.8+3.2+2.7+3.3)/4 = $3.0**.
  → `10 × 16h × 1000 × 3.0 = 480 000` pts; booster **0**.

---

# 📆 Day 3 — Tue, 2025-01-07

## Actions

- **U1** (TASK1/TOKENA) `10:00–11:00`, **amount 1000**.
- **U1** opens (TASK2/TOKENB) **from 14:00**, **amount 1500** (stays open).
- **U2** (TASK1/TOKENA) `12:00–13:00`, **amount 600**.
- **U2** keeps long open (TASK1/TOKENA) all day, **amount 1000**.
- **U4** (TASK2/TOKENB) `09:00–10:00`, **amount 1100**.
- U3: no actions.
- **Booster for U1 starts only tomorrow (Jan 8)**.

## Calculations

- **U1/200003 (TOKENA 10–11)**: fallback **08:00 = $3.8**.
  → `10 × 1h × 1000 × 3.8 = 38 000` pts.
- **U1/200010 (TOKENB 14–24 open segment today 10h)**: in-segment feeds **16:00 = $6.7**, **20:00 = $7.3** → avg **$7.0**.
  → `15 × 10h × 1500 × 7.0 = 1 575 000` pts; booster **0** (starts tomorrow).
- **U2/200005 (TOKENA 12–13)**: in-segment feed **12:00 = $4.2**.
  → `10 × 1h × 600 × 4.2 = 25 200` pts.
- **U2/200012 (TOKENA 00–24)**: day-avg **$4.0** (feeds at 00/04/08/12/16/20).
  → `10 × 24h × 1000 × 4.0 = 960 000` pts; booster **0**.
- **U4/200008 (TOKENB 09–10)**: fallback **08:00 = $6.8**.
  → `15 × 1h × 1100 × 6.8 = 112 200` pts.

---

# 📆 Day 4 — Wed, 2025-01-08

## Actions

- **U1** (TASK1/TOKENA) opens `10:00–…`, **amount 2000**.
- **U1** continues open (TASK2/TOKENB) all day (from yesterday 14:00), **amount 1500**.
- **U2** (TASK3/TOKENC) opens `12:00–…`, **amount 3000`** (**excluded**: unit = `vote`).
- **U2** continues open (TASK1/TOKENA) all day, **amount 1000**.
- **Booster**: **U1 has ×1.5** active all day.

## Calculations

_(No Jan 8 price feeds — everything uses fallback to the last price before the segment start.)_

- **U1/200010 (TOKENB 00–24)**: fallback **Jan 7 20:00 = $7.3**.
  → base `15 × 24h × 1500 × 7.3 = 3 942 000` pts; **booster = +1 971 000**.
- **U1/200009 (TOKENA 10–24, 14h)**: fallback **Jan 7 20:00 = $4.3**.
  → base `10 × 14h × 2000 × 4.3 = 1 204 000` pts; **booster = +602 000**.
- **U2/200011 (TOKENC 12–… )**: **ignored** (unit `vote`).
- **U2/200012 (TOKENA 00–24)**: fallback **Jan 7 20:00 = $4.3**.
  → base `10 × 24h × 1000 × 4.3 = 1 032 000` pts; booster **0**.
