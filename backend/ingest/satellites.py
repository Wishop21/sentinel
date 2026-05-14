"""
SENTINEL — Satellite ingestion pipeline
Source: CelesTrak GP data API
TLE refresh: daily via scheduler (positions change slowly at this cadence)
Position propagation: every 10 seconds via skyfield, server-side

Correct CelesTrak URL format (as of 2024):
  https://celestrak.org/NORAD/elements/gp.php?GROUP=<group>&FORMAT=TLE

Groups fetched:
  stations    : ISS, Tiangong, crewed stations
  starlink    : SpaceX Starlink constellation
  oneweb      : OneWeb constellation
  gps-ops     : GPS operational constellation
  glonass-ops : GLONASS operational constellation
  galileo     : Galileo constellation

Note: CelesTrak rate-limits aggressively. We cache TLEs and only refresh
during the scheduled daily job. Do not poll more frequently or your IP
will be blocked.

backend/ingest/satellites.py
"""

import logging
from datetime import datetime, timezone
from typing import Optional
import asyncio

import httpx
import pandas as pd
from skyfield.api import EarthSatellite, load, wgs84

from backend.classify.satellites import classify_satellite

logger = logging.getLogger(__name__)

# Correct CelesTrak GP query endpoint (post-2024 format)
CELESTRAK_BASE = "https://celestrak.org/NORAD/elements/gp.php"

GROUPS = {
    "stations":    f"{CELESTRAK_BASE}?GROUP=stations&FORMAT=TLE",
    "oneweb":      f"{CELESTRAK_BASE}?GROUP=oneweb&FORMAT=TLE",
    "gps-ops":     f"{CELESTRAK_BASE}?GROUP=gps-ops&FORMAT=TLE",
    "glonass-ops": f"{CELESTRAK_BASE}?GROUP=glonass-ops&FORMAT=TLE",
    "galileo":     f"{CELESTRAK_BASE}?GROUP=galileo&FORMAT=TLE",
}

# CelesTrak asks users to identify themselves in User-Agent
REQUEST_HEADERS = {
    "User-Agent": "SENTINEL/1.0 (academic research project)"
}

# Skyfield timescale — load once, reuse across all propagation calls
_ts = load.timescale()

# In-memory TLE cache
_tle_cache: dict[str, list[tuple]] = {}
_cache_timestamp: Optional[datetime] = None

# Set longer than 24h so the daily scheduler job is always the one that
# triggers a refresh. If set to 12h the cache would expire between scheduler
# runs and a cold startup mid-day would silently use stale TLEs.
CACHE_MAX_AGE_HOURS = 25


def invalidate_tle_cache() -> None:
    """
    Explicitly invalidate the TLE cache.
    Called by the scheduler's daily refresh job instead of mutating
    module state directly from outside this module.
    """
    global _cache_timestamp
    _cache_timestamp = None
    logger.debug("TLE cache invalidated")


def _parse_tle_text(text: str, group: str) -> list[tuple]:
    """
    Parse raw 3-line TLE text into (name, line1, line2, group) tuples.
    """
    lines = [l.strip() for l in text.strip().splitlines() if l.strip()]
    entries = []
    i = 0
    while i < len(lines):
        if (
            i + 2 < len(lines)
            and lines[i + 1].startswith("1 ")
            and lines[i + 2].startswith("2 ")
        ):
            entries.append((lines[i], lines[i + 1], lines[i + 2], group))
            i += 3
        else:
            i += 1
    return entries


async def fetch_tle_catalog() -> dict[str, list[tuple]]:
    """
    Fetch TLE data for all groups from CelesTrak.
    Returns cached data if still within CACHE_MAX_AGE_HOURS.
    Refresh is normally triggered by invalidate_tle_cache() + this call
    from the daily scheduler job.
    """
    global _tle_cache, _cache_timestamp

    if _cache_timestamp:
        age = (datetime.now(timezone.utc) - _cache_timestamp).total_seconds() / 3600
        if age < CACHE_MAX_AGE_HOURS and _tle_cache:
            logger.debug(f"Using cached TLE data ({age:.1f}h old)")
            return _tle_cache

    logger.info("Fetching fresh TLE catalog from CelesTrak...")
    catalog = {}

    async with httpx.AsyncClient(timeout=30.0, headers=REQUEST_HEADERS, follow_redirects=True) as client:
        for group, url in GROUPS.items():
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                if "No GP data found" in resp.text:
                    logger.warning(f"TLE group '{group}': no data returned")
                    catalog[group] = []
                    continue
                entries = _parse_tle_text(resp.text, group)
                catalog[group] = entries
                logger.info(f"TLE group '{group}': {len(entries)} satellites")
            except httpx.HTTPStatusError as e:
                logger.warning(f"TLE group '{group}' HTTP {e.response.status_code} — using cache")
                catalog[group] = _tle_cache.get(group, [])
            except Exception as e:
                logger.warning(f"TLE group '{group}' failed: {e} — using cache")
                catalog[group] = _tle_cache.get(group, [])

            # Delay between requests to respect CelesTrak rate limits
            await asyncio.sleep(1.5)

    _tle_cache = catalog
    _cache_timestamp = datetime.now(timezone.utc)

    total = sum(len(v) for v in catalog.values())
    logger.info(f"TLE catalog loaded: {total} satellites across {len(catalog)} groups")
    return catalog


def propagate_positions(catalog: dict[str, list[tuple]]) -> pd.DataFrame:
    """
    Propagate current positions for all satellites using skyfield.
    Propagation failures (decayed orbits, bad TLEs) are silently skipped.
    """
    now = _ts.now()
    rows = []
    failures = 0

    for group, entries in catalog.items():
        for name, tle1, tle2, grp in entries:
            try:
                sat = EarthSatellite(tle1, tle2, name, _ts)
                geocentric = sat.at(now)
                subpoint = wgs84.subpoint(geocentric)

                rows.append({
                    "name":          name.strip(),
                    "group":         grp,
                    "lat":           subpoint.latitude.degrees,
                    "lon":           subpoint.longitude.degrees,
                    "altitude_km":   subpoint.elevation.km,
                    "snapshot_time": datetime.now(timezone.utc).isoformat(),
                    "tle1":          tle1,
                    "tle2":          tle2,
                })
            except Exception:
                failures += 1
                continue

    if failures > 0:
        logger.debug(f"Propagation: {failures} satellites skipped (decayed/bad TLE)")

    df = pd.DataFrame(rows)
    if not df.empty:
        df = classify_satellite(df)

    return df


async def ingest_satellites() -> Optional[pd.DataFrame]:
    """
    Full cycle: fetch TLEs (from cache or network) → propagate positions → classify.
    """
    catalog = await fetch_tle_catalog()

    if not any(catalog.values()):
        logger.error("TLE catalog empty — check CelesTrak connectivity")
        return None

    df = propagate_positions(catalog)

    if df.empty:
        logger.warning("No satellite positions propagated")
        return None

    logger.info(
        f"Satellite positions: {len(df)} objects | "
        f"{df['classification'].value_counts().to_dict()}"
    )
    return df
