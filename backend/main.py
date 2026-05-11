"""
SENTINEL — FastAPI application
All API routes are defined here for Stage 1.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.config import settings
from backend.scheduler import start_scheduler, get_live_satellites
from backend.ingest.vessels import connect_aisstream, disconnect_aisstream, get_live_vessels
from backend.storage.metrics import init_db, get_global_counts, get_data_quality

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown sequence."""
    logger.info("SENTINEL starting up...")
    settings.ensure_dirs()
    await init_db()
    start_scheduler()
    # Start AIS WebSocket in background
    asyncio.create_task(connect_aisstream())
    logger.info("SENTINEL online")
    yield
    logger.info("SENTINEL shutting down...")
    await disconnect_aisstream()


app = FastAPI(
    title="SENTINEL",
    description="Global asset tracking and analytics platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten this for production
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Live data endpoints ────────────────────────────────────────────────────

@app.get("/api/live/aircraft")
async def live_aircraft():
    import math
    from backend.ingest.aircraft import fetch_aircraft
    df = await fetch_aircraft()
    if df is None:
        raise HTTPException(503, "Aircraft data temporarily unavailable")

    cols = ["icao24", "callsign", "origin_country", "lat", "lon",
            "baro_altitude", "velocity", "true_track", "on_ground",
            "classification", "confidence"]

    records = []
    for row in df[cols].to_dict(orient="records"):
        clean = {
            k: (None if isinstance(v, float) and (math.isnan(v) or math.isinf(v)) else v)
            for k, v in row.items()
        }
        records.append(clean)

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "count": len(records),
        "data": records,
    }


@app.get("/api/live/satellites")
async def live_satellites(
    group: str = Query(None, description="Filter by group: starlink, gps-ops, etc.")
):
    """
    Current satellite positions propagated from TLE data.
    Served from in-memory cache updated every 10 seconds.
    """
    sats = get_live_satellites()

    if group:
        sats = [s for s in sats if s.get("group") == group]

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "count": len(sats),
        "data": sats,
    }


@app.get("/api/live/vessels")
async def live_vessels():
    """
    Current vessel positions from AIS WebSocket stream.
    Served from in-memory state, updated continuously.
    """
    vessels = get_live_vessels()
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "count": len(vessels),
        "data": vessels,
    }


# ── Metrics endpoints (Tier 1 precomputed) ────────────────────────────────

@app.get("/api/metrics/global")
async def metrics_global(
    domain: str = Query(None, description="aircraft | vessel | satellite"),
    hours: int = Query(24, ge=1, le=720),
):
    """Precomputed global counts for the Tier 1 dashboard."""
    data = await get_global_counts(domain=domain, hours=hours)
    return {"data": data, "hours": hours}


@app.get("/api/metrics/country/{country}")
async def metrics_country(country: str, hours: int = Query(24, ge=1, le=720)):
    """Per-country breakdown — placeholder for Stage 3 implementation."""
    return {"country": country, "hours": hours, "data": [], "note": "Coming in Stage 3"}


# ── Analytics endpoints (Tier 2 — query on demand) ────────────────────────

class RegionQuery(BaseModel):
    # GeoJSON polygon coordinates [[lon, lat], [lon, lat], ...]
    coordinates: list[list[float]]
    domain: str = "aircraft"  # aircraft | vessel | satellite | all


@app.post("/api/analytics/region")
async def analytics_region(query: RegionQuery):
    """
    Count and classify assets within a user-drawn polygon.
    Placeholder — full implementation in Stage 4.
    """
    return {
        "note": "Region analytics coming in Stage 4",
        "received_coordinates": len(query.coordinates),
        "domain": query.domain,
    }


# ── Stage 3 Analytics endpoints ───────────────────────────────────────────

@app.get("/api/analytics/countries")
async def analytics_countries(
    domain: str = Query("aircraft", description="aircraft | vessel | satellite"),
    limit: int = Query(15, ge=5, le=50),
    hours: int = Query(1, ge=1, le=24),
):
    """Top countries by asset count, averaged over last `hours`."""
    from backend.analytics.regional import get_country_breakdown
    data = await get_country_breakdown(domain=domain, limit=limit, hours=hours)
    if not data:
        return {"domain": domain, "note": "Insufficient data — accumulates over time", "data": []}
    return {"domain": domain, "hours": hours, "data": data}


@app.get("/api/analytics/trends")
async def analytics_trends(
    domain: str = Query(None),
    hours: int = Query(24, ge=1, le=168),
):
    """Time-series trend data for sparklines."""
    from backend.analytics.regional import get_global_trends, get_all_trends
    if domain:
        data = await get_global_trends(domain=domain, hours=hours)
        return {"domain": domain, "hours": hours, "data": data}
    summary = await get_all_trends()
    return {"summary": summary}


@app.get("/api/analytics/summary")
async def analytics_summary():
    """Trend summary for all domains — current vs 1h and 24h averages."""
    from backend.analytics.regional import get_all_trends
    return await get_all_trends()


# ── Data quality endpoint ──────────────────────────────────────────────────

@app.get("/api/quality")
async def data_quality(hours: int = Query(24, ge=1, le=168)):
    """
    Data gap log — used by the UI to surface coverage limitations honestly.
    """
    data = await get_data_quality(hours=hours)
    return {"data": data, "hours": hours}


# ── Health check ───────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {
        "status": "online",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "0.1.0",
    }


# ── Serve React frontend (Stage 2 onwards) ────────────────────────────────
# Uncomment when frontend/dist exists
# app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="frontend")
