"""
SENTINEL — Parquet snapshot storage

Storage layout:
  data/raw/{domain}/{YYYY}/{MM}/{DD}/{HH}_{MM}.parquet

One file per 15-minute snapshot per domain.
Files are columnar-compressed — expect ~80-90% size reduction vs CSV.

Retention: a daily cleanup job deletes files older than RAW_RETENTION_DAYS.
Missing snapshots are logged to the metrics DB for UI transparency.

backend/storage/parquet.py
"""

import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pandas as pd

from backend.config import settings

logger = logging.getLogger(__name__)


def _snapshot_path(domain: str, timestamp: datetime) -> Path:
    """
    Build the parquet file path for a given domain and timestamp.
    Rounds timestamp to the nearest 15-minute boundary for consistent naming.
    """
    # Round down to 15-minute boundary
    minute = (timestamp.minute // 15) * 15
    base = settings.data_dir / "raw" / domain
    return (
        base
        / str(timestamp.year)
        / f"{timestamp.month:02d}"
        / f"{timestamp.day:02d}"
        / f"{timestamp.hour:02d}_{minute:02d}.parquet"
    )


async def save_snapshot(df: pd.DataFrame, domain: str) -> Path:
    """
    Save a DataFrame snapshot to Parquet.
    Creates parent directories as needed.
    Returns the path written.
    """
    timestamp = datetime.now(timezone.utc)
    path = _snapshot_path(domain, timestamp)
    path.parent.mkdir(parents=True, exist_ok=True)

    # Write with snappy compression — good balance of speed vs size
    df.to_parquet(path, compression="snappy", index=False)

    size_kb = path.stat().st_size / 1024
    logger.debug(f"Saved {domain} snapshot: {len(df)} records → {path.name} ({size_kb:.1f} KB)")

    return path


async def load_snapshots(
    domain: str,
    start: datetime,
    end: datetime,
) -> pd.DataFrame:
    """
    Load and concatenate all snapshots for a domain within a time range.
    Handles missing files gracefully — gaps are expected and honest.
    """
    base = settings.data_dir / "raw" / domain

    # Walk the date range and collect all expected parquet paths
    frames = []
    missing = []

    current = start.replace(minute=(start.minute // 15) * 15, second=0, microsecond=0)
    while current <= end:
        path = _snapshot_path(domain, current)
        if path.exists():
            try:
                frames.append(pd.read_parquet(path))
            except Exception as e:
                logger.warning(f"Failed to read {path}: {e}")
                missing.append(current)
        else:
            missing.append(current)
        current += timedelta(minutes=15)

    if missing:
        logger.debug(f"{domain}: {len(missing)} missing snapshots in range")

    if not frames:
        return pd.DataFrame()

    return pd.concat(frames, ignore_index=True)


async def run_retention_cleanup():
    """
    Delete raw snapshot files older than RAW_RETENTION_DAYS.
    Called by the daily scheduler job.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.raw_retention_days)
    deleted = 0
    freed_bytes = 0

    for domain in ("aircraft", "vessels", "satellites"):
        base = settings.data_dir / "raw" / domain
        if not base.exists():
            continue

        for parquet_file in base.rglob("*.parquet"):
            try:
                mtime = datetime.fromtimestamp(
                    parquet_file.stat().st_mtime, tz=timezone.utc
                )
                if mtime < cutoff:
                    size = parquet_file.stat().st_size
                    parquet_file.unlink()
                    deleted += 1
                    freed_bytes += size
            except Exception as e:
                logger.warning(f"Cleanup failed for {parquet_file}: {e}")

    logger.info(
        f"Retention cleanup: removed {deleted} files, "
        f"freed {freed_bytes / 1024 / 1024:.1f} MB"
    )
