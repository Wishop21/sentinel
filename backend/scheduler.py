"""
SENTINEL — Background scheduler
Manages all periodic ingestion and maintenance jobs.

Schedule:
  Every 15s  : fetch aircraft positions → update live cache
  Every 10s  : propagate satellite positions (uses cached TLEs)
  Every 15min: snapshot vessels to Parquet, update metrics DB
  Every 15min: snapshot aircraft metrics to DB
  Daily 00:05: invalidate TLE cache and fetch fresh catalog
  Daily 00:10: run retention cleanup

backend/scheduler.py
"""

import asyncio
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from backend.ingest.aircraft import ingest_aircraft, fetch_aircraft
from backend.ingest.satellites import ingest_satellites, fetch_tle_catalog, invalidate_tle_cache
from backend.ingest.vessels import snapshot_vessels
from backend.storage.parquet import run_retention_cleanup
from backend.storage.metrics import upsert_global_counts, upsert_country_counts, record_snapshot_log

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="UTC")

# ── In-memory live caches ─────────────────────────────────────────────────
# Both are updated by their respective scheduler jobs and read by the
# live API endpoints. This avoids the live endpoints making direct upstream
# API calls on every frontend poll.

_aircraft_cache: list[dict] = []
_satellite_cache: list[dict] = []


def get_live_aircraft() -> list[dict]:
    """Return the most recently ingested aircraft positions."""
    return _aircraft_cache


def get_live_satellites() -> list[dict]:
    """Return the most recently propagated satellite positions."""
    return _satellite_cache


# ── Scheduler jobs ────────────────────────────────────────────────────────

async def _job_aircraft():
    """Fetch aircraft, update live cache, store snapshot, update metrics."""
    global _aircraft_cache
    try:
        df = await fetch_aircraft()
        if df is not None:
            _aircraft_cache = df.to_dict(orient="records")
            await upsert_global_counts("aircraft", df)
            await upsert_country_counts("aircraft", df, country_col="origin_country")
            await record_snapshot_log("aircraft", received=True, record_count=len(df))
        else:
            await record_snapshot_log("aircraft", received=False)
    except Exception as e:
        logger.error(f"Aircraft job failed: {e}")
        await record_snapshot_log("aircraft", received=False, notes=str(e))


async def _job_satellites():
    """Propagate satellite positions using cached TLEs, update live cache."""
    global _satellite_cache
    try:
        df = await ingest_satellites()
        if df is not None:
            _satellite_cache = df.to_dict(orient="records")
    except Exception as e:
        logger.error(f"Satellite job failed: {e}")


async def _job_vessel_snapshot():
    """Snapshot current vessel state to Parquet and update metrics."""
    try:
        await snapshot_vessels()
    except Exception as e:
        logger.error(f"Vessel snapshot job failed: {e}")


async def _job_tle_refresh():
    """
    Invalidate the TLE cache and fetch a fresh catalog from CelesTrak.
    Uses the explicit invalidate_tle_cache() function rather than mutating
    module internals directly.
    """
    try:
        logger.info("Refreshing TLE catalog...")
        invalidate_tle_cache()
        await fetch_tle_catalog()
        logger.info("TLE catalog refreshed")
    except Exception as e:
        logger.error(f"TLE refresh failed: {e}")


async def _job_retention():
    """Delete old Parquet files."""
    try:
        await run_retention_cleanup()
    except Exception as e:
        logger.error(f"Retention cleanup failed: {e}")


def start_scheduler():
    """Register all jobs and start the scheduler."""

    # Aircraft — every 15 seconds
    scheduler.add_job(
        _job_aircraft,
        IntervalTrigger(seconds=15),
        id="aircraft_ingest",
        name="Aircraft ingestion",
        max_instances=1,
        misfire_grace_time=5,
    )

    # Satellites — every 10 seconds (position propagation, fast)
    scheduler.add_job(
        _job_satellites,
        IntervalTrigger(seconds=10),
        id="satellite_propagate",
        name="Satellite propagation",
        max_instances=1,
        misfire_grace_time=5,
    )

    # Vessel snapshot — every 15 minutes
    scheduler.add_job(
        _job_vessel_snapshot,
        IntervalTrigger(minutes=15),
        id="vessel_snapshot",
        name="Vessel snapshot",
        max_instances=1,
        misfire_grace_time=60,
    )

    # TLE catalog refresh — daily at 00:05 UTC
    scheduler.add_job(
        _job_tle_refresh,
        CronTrigger(hour=0, minute=5),
        id="tle_refresh",
        name="TLE catalog refresh",
    )

    # Retention cleanup — daily at 00:10 UTC
    scheduler.add_job(
        _job_retention,
        CronTrigger(hour=0, minute=10),
        id="retention_cleanup",
        name="Data retention cleanup",
    )

    scheduler.start()
    logger.info("Scheduler started — all ingestion jobs active")
