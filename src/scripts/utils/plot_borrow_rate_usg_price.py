"""Plot avg borrow rate (all markets) and USG price over the last week, stacked, to a PNG.

Usage: pip install matplotlib && python3 src/scripts/utils/plot_borrow_rate_usg_price.py [out.png]
"""

import json
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt

API = "https://api.tangent.finance"
ADDRESSES = "https://raw.githubusercontent.com/Tangent-labs/public-files/main/addresses.json"
USG = "0xb1c2db5d6ca03fce73dbd304d320bf76c55ae1b1"


def get(url):
    # Default urllib User-Agent gets a 403 from the API
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "tangent-plot"})) as r:
        return json.load(r)


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def hour(t):
    return t.replace(minute=0, second=0, microsecond=0)


def avg_borrow_rate(since):
    # hour -> list of per-market hourly means
    buckets = defaultdict(list)
    for m in get(ADDRESSES)["markets"]:
        rows = get(f"{API}/markets/{m['marketAddress'].lower()}/dateFrom/{since.strftime('%Y-%m-%dT%H:%M:%SZ')}")
        per_hour = defaultdict(list)
        for r in rows:
            t = ts(r["timestamp"])
            # API doesn't apply dateFrom; ir_apy == 0 means the market doesn't report a rate
            if t >= since and r["ir_apy"]:
                per_hour[hour(t)].append(r["ir_apy"])
        for h, v in per_hour.items():
            buckets[h].append(sum(v) / len(v))
    hours = sorted(buckets)
    return hours, [sum(buckets[h]) / len(buckets[h]) for h in hours]


def usg_price(since):
    history = get(f"{API}/price-history/{USG}?range=1w")[0]["history"]
    points = [(ts(p["timestamp"]), float(p["amount"])) for p in history if ts(p["timestamp"]) >= since]
    return [t for t, _ in points], [v for _, v in points]


def main(out):
    since = datetime.now(timezone.utc) - timedelta(days=7)
    graphs = [
        ("USG price", "USD", usg_price(since)),
        ("Avg borrow rate (all markets)", "APY (%)", avg_borrow_rate(since)),
    ]
    fig, axes = plt.subplots(len(graphs), 1, figsize=(12, 4 * len(graphs)), sharex=True)
    for ax, (title, ylabel, (x, y)) in zip(axes, graphs):
        ax.plot(x, y, color="#2a6fdb", linewidth=1.5)
        ax.set_title(title, loc="left")
        ax.set_ylabel(ylabel)
        ax.grid(alpha=0.3)
        ax.spines[["top", "right"]].set_visible(False)
    axes[-1].xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
    fig.tight_layout()
    fig.savefig(out, dpi=150)
    print(f"Saved {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "borrow_rate_usg_price.png")
