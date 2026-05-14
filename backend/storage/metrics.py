"""
SENTINEL — SQLite metrics store

Stores precomputed Tier 1 analytics and the data quality log.
This is what the frontend queries for the persistent dashboard.

Schema:
  global_counts   — total asset counts by classification, every 15 min
  country_counts  — per-country breakdowns, every 15 min
  snapshot_log    — data quality record (was each expected snapshot received?)

We use aiosqlite for async-safe access from FastAPI.

backend/storage/metrics.py
"""

import logging
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite
import pandas as pd

from backend.config import settings

logger = logging.getLogger(__name__)

DB_PATH = settings.metrics_db

CREATE_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS global_counts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        domain TEXT NOT NULL,          -- 'aircraft' | 'vessel' | 'satellite'
        total INTEGER NOT NULL,
        civilian INTEGER DEFAULT 0,
        commercial INTEGER DEFAULT 0,
        cargo INTEGER DEFAULT 0,
        military INTEGER DEFAULT 0,
        government INTEGER DEFAULT 0,
        general INTEGER DEFAULT 0,
        unknown INTEGER NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS country_counts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        domain TEXT NOT NULL,
        country TEXT NOT NULL,
        total INTEGER NOT NULL,
        civilian INTEGER DEFAULT 0,
        commercial INTEGER DEFAULT 0,
        cargo INTEGER DEFAULT 0,
        military INTEGER DEFAULT 0,
        government INTEGER DEFAULT 0,
        general INTEGER DEFAULT 0,
        unknown INTEGER NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS snapshot_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        domain TEXT NOT NULL,
        received INTEGER NOT NULL,     -- 1 = received, 0 = missing
        record_count INTEGER DEFAULT 0,
        notes TEXT
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_global_ts ON global_counts(timestamp)",
    "CREATE INDEX IF NOT EXISTS idx_country_ts ON country_counts(timestamp, domain)",
    "CREATE INDEX IF NOT EXISTS idx_log_ts ON snapshot_log(timestamp, domain)",
]


async def init_db():
    """Initialise the database schema. Safe to call on every startup."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        for statement in CREATE_STATEMENTS:
            await db.execute(statement)
        await db.commit()
    logger.info(f"Metrics DB initialised at {DB_PATH}")


async def record_snapshot_log(
    domain: str,
    received: bool,
    record_count: int = 0,
    notes: str = "",
):
    """Log whether a scheduled snapshot was successfully received."""
    ts = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO snapshot_log (timestamp, domain, received, record_count, notes) "
            "VALUES (?, ?, ?, ?, ?)",
            (ts, domain, int(received), record_count, notes),
        )
        await db.commit()


async def upsert_global_counts(domain: str, df: pd.DataFrame):
    """
    Compute and store global classification counts from a snapshot DataFrame.
    Called immediately after each successful ingestion.
    """
    if df.empty:
        return

    ts = datetime.now(timezone.utc).isoformat()
    counts = df["classification"].value_counts().to_dict()

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO global_counts
                (timestamp, domain, total, civilian, commercial, cargo,
                 military, government, general, unknown)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ts, domain,
                len(df),
                counts.get("civilian", 0),
                counts.get("commercial", 0),
                counts.get("cargo", 0),
                counts.get("military", 0),
                counts.get("government", 0),
                counts.get("general", 0),
                counts.get("unknown", 0),
            ),
        )
        await db.commit()


async def upsert_country_counts(domain: str, df: pd.DataFrame, country_col: str):
    """
    Compute and store per-country classification counts from a snapshot.
    country_col: the DataFrame column containing country name/code.
    """
    if df.empty or country_col not in df.columns:
        return

    ts = datetime.now(timezone.utc).isoformat()
    grouped = df.groupby(country_col)

    rows = []
    for country, group in grouped:
        if not country or pd.isna(country):
            continue
        counts = group["classification"].value_counts().to_dict()
        rows.append((
            ts, domain, str(country),
            len(group),
            counts.get("civilian", 0),
            counts.get("commercial", 0),
            counts.get("cargo", 0),
            counts.get("military", 0),
            counts.get("government", 0),
            counts.get("general", 0),
            counts.get("unknown", 0),
        ))

    async with aiosqlite.connect(DB_PATH) as db:
        await db.executemany(
            """
            INSERT INTO country_counts
                (timestamp, domain, country, total, civilian, commercial, cargo,
                 military, government, general, unknown)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
        await db.commit()


async def get_global_counts(domain: str = None, hours: int = 24) -> list[dict]:
    """
    Fetch recent global counts for the Tier 1 dashboard.
    Returns the last `hours` of 15-minute snapshots.
    """
    query = """
        SELECT * FROM global_counts
        WHERE timestamp >= datetime('now', ?)
        {}
        ORDER BY timestamp DESC
        LIMIT 200
    """.format("AND domain = ?" if domain else "")

    params = [f"-{hours} hours"]
    if domain:
        params.append(domain)

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def get_data_quality(hours: int = 24) -> list[dict]:
    """
    Return the snapshot quality log — used by the UI to show data gaps honestly.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """
            SELECT * FROM snapshot_log
            WHERE timestamp >= datetime('now', ?)
            ORDER BY timestamp DESC
            LIMIT 500
            """,
            (f"-{hours} hours",),
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]
