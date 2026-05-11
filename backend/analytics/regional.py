"""
SENTINEL — Stage 3 Analytics Engine

Query layer for Tier 1 and Tier 2 analytics.
All queries run against the SQLite metrics DB and live data.

Endpoints served:
  /api/analytics/countries  — top countries by aircraft count right now
  /api/analytics/trends     — 24h global count trend lines
  /api/analytics/patterns   — time-of-day traffic patterns
"""

import logging
from datetime import datetime, timezone, timedelta

import aiosqlite
import pandas as pd

from backend.config import settings
from backend.storage.metrics import DB_PATH

logger = logging.getLogger(__name__)


async def get_country_breakdown(
    domain: str = "aircraft",
    limit: int = 15,
    hours: int = 1,
) -> list[dict]:
    """
    Top countries by asset count, averaged over the last `hours`.
    Returns ranked list with classification breakdown.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT
                country,
                AVG(total)      AS avg_total,
                AVG(military)   AS avg_military,
                AVG(commercial) AS avg_commercial,
                AVG(cargo)      AS avg_cargo,
                AVG(civilian)   AS avg_civilian,
                AVG(unknown)    AS avg_unknown,
                MAX(total)      AS peak_total,
                COUNT(*)        AS sample_count
            FROM country_counts
            WHERE domain = ?
              AND country != ''
              AND country IS NOT NULL
              AND timestamp >= datetime('now', ?)
            GROUP BY country
            HAVING sample_count >= 1
            ORDER BY avg_total DESC
            LIMIT ?
            """,
            (domain, f"-{hours} hours", limit),
        ) as cursor:
            rows = await cursor.fetchall()

    result = []
    for r in rows:
        total = r["avg_total"] or 0
        military = r["avg_military"] or 0
        result.append({
            "country":    r["country"],
            "total":      round(total),
            "military":   round(military),
            "commercial": round(r["avg_commercial"] or 0),
            "cargo":      round(r["avg_cargo"] or 0),
            "civilian":   round(r["avg_civilian"] or 0),
            "unknown":    round(r["avg_unknown"] or 0),
            "military_pct": round((military / total * 100) if total > 0 else 0, 1),
            "peak":       r["peak_total"],
        })

    return result


async def get_global_trends(
    domain: str = "aircraft",
    hours: int = 24,
) -> list[dict]:
    """
    Time-series of global asset counts for the last `hours`.
    Returns one data point per 15-minute snapshot.
    Used for sparklines and trend charts.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT
                timestamp,
                total,
                military,
                commercial,
                cargo,
                civilian,
                unknown
            FROM global_counts
            WHERE domain = ?
              AND timestamp >= datetime('now', ?)
            ORDER BY timestamp ASC
            """,
            (domain, f"-{hours} hours"),
        ) as cursor:
            rows = await cursor.fetchall()

    return [dict(r) for r in rows]


async def get_trend_summary(domain: str = "aircraft") -> dict:
    """
    Compare current count to 1h, 6h, and 24h averages.
    Returns deltas and direction indicators for the dashboard.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        # Most recent snapshot
        async with db.execute(
            """
            SELECT total FROM global_counts
            WHERE domain = ?
            ORDER BY timestamp DESC LIMIT 1
            """,
            (domain,),
        ) as cursor:
            current_row = await cursor.fetchone()

        if not current_row:
            return {"current": 0, "delta_1h": 0, "delta_24h": 0, "trend": "insufficient_data"}

        current = current_row["total"]

        # 1h average
        async with db.execute(
            """
            SELECT AVG(total) as avg FROM global_counts
            WHERE domain = ?
              AND timestamp >= datetime('now', '-1 hours')
            """,
            (domain,),
        ) as cursor:
            row = await cursor.fetchone()
            avg_1h = row["avg"] or current

        # 24h average
        async with db.execute(
            """
            SELECT AVG(total) as avg FROM global_counts
            WHERE domain = ?
              AND timestamp >= datetime('now', '-24 hours')
            """,
            (domain,),
        ) as cursor:
            row = await cursor.fetchone()
            avg_24h = row["avg"] or current

    delta_1h  = round(current - avg_1h)
    delta_24h = round(current - avg_24h)

    # Trend direction — only call it a trend if delta is meaningful (>2%)
    if avg_24h > 0:
        pct = (current - avg_24h) / avg_24h * 100
        trend = "up" if pct > 2 else "down" if pct < -2 else "stable"
    else:
        trend = "insufficient_data"

    return {
        "current":    current,
        "avg_1h":     round(avg_1h),
        "avg_24h":    round(avg_24h),
        "delta_1h":   delta_1h,
        "delta_24h":  delta_24h,
        "trend":      trend,
        "pct_vs_24h": round(pct if avg_24h > 0 else 0, 1),
    }


async def get_all_trends() -> dict:
    """Fetch trend summaries for all three domains."""
    aircraft  = await get_trend_summary("aircraft")
    vessel    = await get_trend_summary("vessel")
    satellite = await get_trend_summary("satellite")
    return {
        "aircraft":  aircraft,
        "vessel":    vessel,
        "satellite": satellite,
    }
