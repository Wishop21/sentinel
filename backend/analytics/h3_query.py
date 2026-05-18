"""
SENTINEL — H3 region query engine
backend/analytics/h3_query.py

Converts a clicked lat/lon into an H3 hexagonal cell, then queries
Parquet snapshots for all assets observed within that cell over the
requested time window.

H3 resolution 3 is used as the default:
  - Average cell area: ~12,100 km²
  - Coarse enough to always contain meaningful asset counts
  - Fine enough to be geographically specific

H3 containment check is O(1) per asset — h3.latlng_to_cell() hashes
the asset's lat/lon to an H3 index at the target resolution and compares
it to the selected cell index. No Shapely or point-in-polygon needed.

Dependencies: h3 (pip install h3)
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import pandas as pd

try:
    import h3
    H3_AVAILABLE = True
except ImportError:
    H3_AVAILABLE = False
    logging.getLogger(__name__).error(
        "h3 package not installed — region queries unavailable. "
        "Run: pip install h3"
    )

from backend.storage.parquet import load_snapshots

logger = logging.getLogger(__name__)

DEFAULT_RESOLUTION = 3
DOMAINS = ("aircraft", "vessels", "satellites")


def check_h3_available() -> bool:
    return H3_AVAILABLE


def latlon_to_h3(lat: float, lon: float, resolution: int = DEFAULT_RESOLUTION) -> str:
    """Convert a lat/lon coordinate to an H3 cell index."""
    if not H3_AVAILABLE:
        raise RuntimeError("h3 package not installed")
    return h3.latlng_to_cell(lat, lon, resolution)


def h3_to_boundary(cell: str) -> list[list[float]]:
    """
    Return the cell boundary as a closed list of [lon, lat] pairs
    suitable for deck.gl polygon rendering.
    h3.cell_to_boundary() returns (lat, lon) tuples — we flip to (lon, lat).
    """
    if not H3_AVAILABLE:
        raise RuntimeError("h3 package not installed")
    # Returns list of (lat, lon) — flip for GeoJSON/deck.gl convention
    boundary = h3.cell_to_boundary(cell)
    coords = [[lon, lat] for lat, lon in boundary]
    # Close the ring
    coords.append(coords[0])
    return coords


def h3_cell_center(cell: str) -> tuple[float, float]:
    """Return the (lat, lon) center of an H3 cell."""
    if not H3_AVAILABLE:
        raise RuntimeError("h3 package not installed")
    lat, lon = h3.cell_to_latlng(cell)
    return lat, lon


def _classify_assets_in_cell(
    df: pd.DataFrame,
    h3_index: str,
    lat_col: str,
    lon_col: str,
    resolution: int,
) -> pd.DataFrame:
    """
    Filter a DataFrame to only rows whose position falls within the
    given H3 cell. Uses vectorised apply — O(n) with O(1) per row.
    """
    if df.empty:
        return df

    # Drop rows with missing coordinates
    df = df.dropna(subset=[lat_col, lon_col])
    if df.empty:
        return df

    mask = df.apply(
        lambda row: h3.latlng_to_cell(
            float(row[lat_col]),
            float(row[lon_col]),
            resolution,
        ) == h3_index,
        axis=1,
    )
    return df[mask]


def _summarise_domain(df: pd.DataFrame, domain: str) -> dict:
    """Build a classification summary dict from a filtered domain DataFrame."""
    if df.empty:
        return {
            "domain": domain,
            "total": 0,
            "classifications": {},
            "unique_assets": 0,
        }

    # Unique asset count by domain identifier
    id_col = {"aircraft": "icao24", "vessels": "mmsi", "satellites": "name"}.get(domain)
    unique = df[id_col].nunique() if id_col and id_col in df.columns else len(df)

    cls_counts = {}
    if "classification" in df.columns:
        cls_counts = df["classification"].value_counts().to_dict()

    return {
        "domain": domain,
        "total": len(df),
        "unique_assets": unique,
        "classifications": cls_counts,
    }


async def query_region(
    lat: float,
    lon: float,
    resolution: int = DEFAULT_RESOLUTION,
    hours: int = 24,
) -> dict:
    """
    Main entry point for region analytics.

    1. Resolves (lat, lon) to an H3 cell index
    2. Loads Parquet snapshots for all domains over the requested window
    3. Filters each snapshot to assets within the H3 cell
    4. Returns counts, classifications, and trend data per domain

    Returns a dict ready to serialise as a JSON API response.
    """
    if not H3_AVAILABLE:
        raise RuntimeError("h3 package not installed — run: pip install h3")

    h3_index = latlon_to_h3(lat, lon, resolution)
    boundary = h3_to_boundary(h3_index)
    cell_lat, cell_lon = h3_cell_center(h3_index)

    now = datetime.now(timezone.utc)
    start = now - timedelta(hours=hours)

    logger.info(f"Region query: H3={h3_index} res={resolution} hours={hours}")

    domain_results = {}
    total_snapshots_loaded = 0

    for domain in DOMAINS:
        lat_col = "lat"
        lon_col = "lon"

        try:
            df = await load_snapshots(domain, start, now)
            total_snapshots_loaded += len(df)
        except Exception as e:
            logger.warning(f"Region query: failed to load {domain} snapshots: {e}")
            df = pd.DataFrame()

        if not df.empty:
            df = _classify_assets_in_cell(df, h3_index, lat_col, lon_col, resolution)

        domain_results[domain] = _summarise_domain(df, domain)

    # Trend: split the window into two halves and compare asset counts
    # First half = older, second half = recent. Delta = recent - older.
    midpoint = start + timedelta(hours=hours / 2)
    trend = await _compute_trend(h3_index, resolution, start, midpoint, now)

    total_unique = sum(r["unique_assets"] for r in domain_results.values())

    return {
        "h3_index":   h3_index,
        "resolution": resolution,
        "center":     {"lat": cell_lat, "lon": cell_lon},
        "boundary":   boundary,
        "hours":      hours,
        "queried_at": now.isoformat(),
        "total_unique_assets": total_unique,
        "domains":    domain_results,
        "trend":      trend,
        "data_note":  (
            "Counts reflect assets observed in Parquet snapshots. "
            "Gaps may exist if ingestion was interrupted."
        ),
    }


async def _compute_trend(
    h3_index: str,
    resolution: int,
    start: datetime,
    midpoint: datetime,
    end: datetime,
) -> dict:
    """
    Compare asset counts in the first half vs second half of the window.
    Returns delta and direction for each domain.
    """
    trend = {}

    for domain in DOMAINS:
        try:
            df_old = await load_snapshots(domain, start, midpoint)
            df_new = await load_snapshots(domain, midpoint, end)

            old_in_cell = 0
            new_in_cell = 0

            if not df_old.empty:
                old_in_cell = len(_classify_assets_in_cell(
                    df_old, h3_index, "lat", "lon", resolution
                ))
            if not df_new.empty:
                new_in_cell = len(_classify_assets_in_cell(
                    df_new, h3_index, "lat", "lon", resolution
                ))

            delta = new_in_cell - old_in_cell
            if old_in_cell > 0:
                pct = round((delta / old_in_cell) * 100, 1)
                direction = "up" if pct > 5 else "down" if pct < -5 else "stable"
            else:
                pct = 0
                direction = "insufficient_data"

            trend[domain] = {
                "older_half":  old_in_cell,
                "recent_half": new_in_cell,
                "delta":       delta,
                "pct_change":  pct,
                "direction":   direction,
            }

        except Exception as e:
            logger.warning(f"Trend computation failed for {domain}: {e}")
            trend[domain] = {"direction": "insufficient_data"}

    return trend
