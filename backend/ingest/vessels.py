"""
SENTINEL — Vessel ingestion pipeline
Source: AISstream.io WebSocket API (https://aisstream.io)
Connection: persistent WebSocket, global bounding box
Snapshot: every 15 minutes we freeze the current state to Parquet

AIS (Automatic Identification System) data is self-reported by vessels.
Military vessels frequently do not broadcast or use false data.
Classification confidence reflects this honestly.

AIS vessel type codes (selected):
  0-19:  reserved/unknown
  20-29: Wing in ground (WIG)
  30:    Fishing
  31-32: Towing
  33-34: Dredging/diving
  35:    Military
  36:    Sailing
  37:    Pleasure craft
  50-59: Pilot, SAR, tugs, port tenders
  60-69: Passenger
  70-79: Cargo
  80-89: Tanker
  90-99: Other

backend/ingest/vessels.py
"""

import asyncio
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import websockets
import pandas as pd

from backend.config import settings
from backend.classify.vessels import classify_vessel
from backend.storage.parquet import save_snapshot
from backend.storage.metrics import upsert_global_counts, upsert_country_counts, record_snapshot_log

logger = logging.getLogger(__name__)

AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream"

# Global bounding box — entire world
WORLD_BBOX = [[[-180, -90], [180, 90]]]

# Vessels not updated within this window are excluded from the live view.
# AIS transmit intervals: Class A vessels every 2-10s under way, up to 3min at anchor.
# 30 minutes is conservative — covers anchored vessels while pruning truly gone assets.
_STALE_MINUTES = 30

# In-memory vessel state (keyed by MMSI for fast updates)
# This is the "live view" — snapshotted to Parquet every 15 min
_vessel_state: dict[str, dict] = {}
_ws_connection = None
_running = False


def get_live_vessels() -> list[dict]:
    """
    Return current vessel state as a list, excluding stale entries.
    Vessels not updated within _STALE_MINUTES are omitted from the live feed
    but remain in _vessel_state until the next snapshot cycle clears them.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=_STALE_MINUTES)).isoformat()
    return [v for v in _vessel_state.values() if v.get("last_update", "") >= cutoff]


async def _handle_message(message: str):
    """Process a single AISstream WebSocket message."""
    global _vessel_state
    try:
        data = json.loads(message)
        meta = data.get("MetaData", {})
        mmsi = str(meta.get("MMSI", ""))

        if not mmsi:
            return

        pos_report = data.get("Message", {}).get("PositionReport", {})
        if not pos_report:
            # Some message types don't have position — update metadata only
            return

        lat = pos_report.get("Latitude")
        lon = pos_report.get("Longitude")

        if lat is None or lon is None:
            return

        # Update vessel state
        existing = _vessel_state.get(mmsi, {})
        _vessel_state[mmsi] = {
            "mmsi": mmsi,
            "name": meta.get("ShipName", "").strip() or existing.get("name", ""),
            "lat": lat,
            "lon": lon,
            "heading": pos_report.get("TrueHeading"),
            "speed": pos_report.get("Sog"),  # Speed over ground (knots)
            "vessel_type": meta.get("ShipType", existing.get("vessel_type")),
            "flag": meta.get("MMSI_CountryCode", existing.get("flag", "")),
            "last_update": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as e:
        logger.debug(f"AIS message parse error: {e}")


async def snapshot_vessels():
    """
    Freeze the current vessel state to Parquet.
    Snapshots only live (non-stale) vessels — consistent with get_live_vessels().
    Called every 15 minutes by the scheduler.
    """
    live = get_live_vessels()
    if not live:
        await record_snapshot_log("vessels", received=False, notes="No active AIS data in state")
        return

    df = pd.DataFrame(live)
    df = classify_vessel(df)

    await save_snapshot(df, domain="vessels")
    await upsert_global_counts("vessels", df)
    await upsert_country_counts("vessels", df, country_col="flag")
    await record_snapshot_log("vessels", received=True, record_count=len(df))

    logger.info(f"Vessel snapshot: {len(df)} active vessels ({len(_vessel_state)} total in state)")


async def connect_aisstream():
    """
    Maintain a persistent WebSocket connection to AISstream.
    Reconnects automatically on disconnect.
    """
    global _ws_connection, _running
    _running = True

    if not settings.aisstream_api_key:
        logger.error(
            "AISSTREAM_API_KEY not set — vessel layer disabled. "
            "Get a free key at https://aisstream.io"
        )
        return

    subscribe_message = json.dumps({
        "APIKey": settings.aisstream_api_key,
        "BoundingBoxes": WORLD_BBOX,
        "FiltersShipMMSI": [],
        "FilterMessageTypes": ["PositionReport"],
    })

    backoff = 5  # seconds between reconnect attempts
    while _running:
        try:
            logger.info("Connecting to AISstream...")
            async with websockets.connect(
                AISSTREAM_URL,
                ping_interval=20,
                ping_timeout=20,
            ) as ws:
                _ws_connection = ws
                await ws.send(subscribe_message)
                logger.info("AISstream connected — receiving vessel data")
                backoff = 5  # Reset backoff on successful connection

                async for message in ws:
                    if not _running:
                        break
                    await _handle_message(message)

        except websockets.exceptions.ConnectionClosed:
            logger.warning(f"AISstream connection closed — reconnecting in {backoff}s")
        except Exception as e:
            logger.error(f"AISstream error: {e} — reconnecting in {backoff}s")

        if _running:
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)  # Exponential backoff, cap at 60s


async def disconnect_aisstream():
    """Gracefully disconnect from AISstream."""
    global _running, _ws_connection
    _running = False
    if _ws_connection:
        await _ws_connection.close()
