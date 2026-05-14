"""
SENTINEL — Aircraft ingestion pipeline
Source: OpenSky Network REST API (OAuth2 authentication)
Fetch interval: every 15 seconds

OpenSky returns state vectors for all aircraft currently tracked.
We use OAuth2 client credentials — get your free credentials at:
https://opensky-network.org/index.php?option=com_opensky&view=credential

backend/ingest/aircraft.py
"""

import logging
import time
from datetime import datetime, timezone
from typing import Optional

import httpx
import pandas as pd

from backend.config import settings
from backend.classify.aircraft import classify_aircraft
from backend.storage.parquet import save_snapshot

logger = logging.getLogger(__name__)

OPENSKY_URL = "https://opensky-network.org/api/states/all"
OPENSKY_TOKEN_URL = (
    "https://auth.opensky-network.org/auth/realms/opensky-network"
    "/protocol/openid-connect/token"
)

# Base column names from OpenSky state vector format
# See: https://openskynetwork.github.io/opensky-api/rest.html
OPENSKY_BASE_COLUMNS = [
    "icao24",
    "callsign",
    "origin_country",
    "time_position",
    "last_contact",
    "lon",
    "lat",
    "baro_altitude",
    "on_ground",
    "velocity",
    "true_track",
    "vertical_rate",
    "sensors",
    "geo_altitude",
    "squawk",
    "spi",
    "position_source",
]

# Extended mode adds 'category' as column 18
OPENSKY_EXTENDED_COLUMN = "category"

# ── OAuth2 token cache ────────────────────────────────────────────────────
# Tokens are cached until 30s before expiry to avoid per-poll token fetches.
# OpenSky tokens typically have a 300–3600s TTL; we read `expires_in` from
# the response and store the expiry wall-clock time.
_cached_token: Optional[str] = None
_token_expiry: float = 0.0  # Unix timestamp after which the token is invalid


async def _get_opensky_token(client: httpx.AsyncClient) -> Optional[str]:
    """
    Return a valid bearer token, using the cache where possible.
    Fetches a new token only when the cache is empty or within 30s of expiry.
    """
    global _cached_token, _token_expiry

    # Return cached token if still valid
    if _cached_token and time.time() < _token_expiry - 30:
        return _cached_token

    if not settings.opensky_client_id or not settings.opensky_client_secret:
        return None

    try:
        resp = await client.post(
            OPENSKY_TOKEN_URL,
            data={
                "grant_type": "client_credentials",
                "client_id": settings.opensky_client_id,
                "client_secret": settings.opensky_client_secret,
            },
            timeout=10.0,
        )
        resp.raise_for_status()
        token_data = resp.json()
        _cached_token = token_data["access_token"]
        # expires_in is seconds from now; default to 300s if not present
        expires_in = token_data.get("expires_in", 300)
        _token_expiry = time.time() + expires_in
        logger.debug(f"OpenSky token refreshed (expires in {expires_in}s)")
        return _cached_token
    except Exception as e:
        logger.warning(f"OpenSky token fetch failed: {e} — falling back to anonymous")
        _cached_token = None
        _token_expiry = 0.0
        return None


async def fetch_aircraft() -> Optional[pd.DataFrame]:
    """
    Fetch current aircraft state vectors from OpenSky.
    Returns a cleaned, enriched DataFrame or None on failure.
    """
    timestamp = datetime.now(timezone.utc)

    async with httpx.AsyncClient(timeout=15.0) as client:
        headers = {}
        if settings.opensky_client_id and settings.opensky_client_secret:
            token = await _get_opensky_token(client)
            if token:
                headers["Authorization"] = f"Bearer {token}"
            else:
                logger.warning("Using anonymous OpenSky access — stricter rate limits apply")
        else:
            logger.warning(
                "OpenSky credentials not configured. "
                "Set OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET in .env"
            )

        try:
            response = await client.get(
                OPENSKY_URL,
                headers=headers,
                params={"extended": 1},
            )
            response.raise_for_status()
            data = response.json()

        except httpx.TimeoutException:
            logger.error("OpenSky request timed out")
            return None
        except httpx.HTTPStatusError as e:
            logger.error(f"OpenSky HTTP error: {e.response.status_code}")
            # If 401, clear the token cache so the next poll re-authenticates
            if e.response.status_code == 401:
                global _cached_token, _token_expiry
                _cached_token = None
                _token_expiry = 0.0
            return None
        except Exception as e:
            logger.error(f"OpenSky fetch failed: {e}")
            return None

    states = data.get("states")
    if not states:
        logger.warning("OpenSky returned no states")
        return None

    # Build column list dynamically based on actual response width.
    actual_col_count = len(states[0])
    columns = OPENSKY_BASE_COLUMNS.copy()

    if actual_col_count == len(columns) + 1:
        columns.append(OPENSKY_EXTENDED_COLUMN)
    elif actual_col_count != len(columns):
        logger.warning(
            f"OpenSky returned {actual_col_count} columns, expected "
            f"{len(columns)} or {len(columns) + 1}. Adapting dynamically."
        )
        while len(columns) < actual_col_count:
            columns.append(f"extra_{len(columns)}")
        columns = columns[:actual_col_count]

    df = pd.DataFrame(states, columns=columns)

    # Drop rows with no position
    df = df.dropna(subset=["lat", "lon"])

    # Clean callsigns (trailing spaces are common in OpenSky data)
    df["callsign"] = df["callsign"].str.strip().fillna("")

    # Add fetch timestamp
    df["snapshot_time"] = timestamp.isoformat()

    # Enrich with classification
    df = classify_aircraft(df)

    logger.info(
        f"Aircraft snapshot: {len(df)} aircraft | "
        f"{df['classification'].value_counts().to_dict()}"
    )

    return df


async def ingest_aircraft():
    """
    Full ingestion cycle: fetch → classify → store.
    Called by the scheduler every 15 seconds.
    """
    df = await fetch_aircraft()
    if df is None:
        return
    await save_snapshot(df, domain="aircraft")
