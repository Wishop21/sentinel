"""
SENTINEL — FastAPI application
"""

import asyncio
import json
import logging
import math
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
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
    logger.info("SENTINEL starting up...")
    settings.ensure_dirs()
    await init_db()
    start_scheduler()
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
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Live data endpoints ────────────────────────────────────────────────────

@app.get("/api/live/aircraft")
async def live_aircraft():
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
    vessels = get_live_vessels()
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "count": len(vessels),
        "data": vessels,
    }


# ── Metrics endpoints ──────────────────────────────────────────────────────

@app.get("/api/metrics/global")
async def metrics_global(
    domain: str = Query(None),
    hours: int = Query(24, ge=1, le=720),
):
    data = await get_global_counts(domain=domain, hours=hours)
    return {"data": data, "hours": hours}


@app.get("/api/metrics/country/{country}")
async def metrics_country(country: str, hours: int = Query(24, ge=1, le=720)):
    return {"country": country, "hours": hours, "data": [], "note": "Coming in Stage 3"}


# ── Analytics endpoints ────────────────────────────────────────────────────

class RegionQuery(BaseModel):
    coordinates: list[list[float]]
    domain: str = "aircraft"


@app.post("/api/analytics/region")
async def analytics_region(query: RegionQuery):
    return {
        "note": "Region analytics coming in Stage 4",
        "received_coordinates": len(query.coordinates),
        "domain": query.domain,
    }


@app.get("/api/analytics/countries")
async def analytics_countries(
    domain: str = Query("aircraft"),
    limit: int = Query(15, ge=5, le=50),
    hours: int = Query(1, ge=1, le=24),
):
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
    from backend.analytics.regional import get_global_trends, get_all_trends
    if domain:
        data = await get_global_trends(domain=domain, hours=hours)
        return {"domain": domain, "hours": hours, "data": data}
    summary = await get_all_trends()
    return {"summary": summary}


@app.get("/api/analytics/summary")
async def analytics_summary():
    from backend.analytics.regional import get_all_trends
    return await get_all_trends()


# ── Military bases layer (static dataset) ─────────────────────────────────

_mil_cache = None

@app.get("/api/layers/military-bases")
async def military_bases():
    """
    Serve curated military facilities from static JSON dataset.
    Generated by: python scripts/generate_military_bases.py
    Data sources: US DoD BSR, Wikipedia verified, public domain.
    """
    global _mil_cache

    if _mil_cache is not None:
        return {"count": len(_mil_cache), "data": _mil_cache}

    candidates = [
        os.path.join("backend", "data", "military_bases.json"),
        os.path.join(os.path.dirname(__file__), "data", "military_bases.json"),
        "backend/data/military_bases.json",
    ]
    for path in candidates:
        if os.path.exists(path):
            with open(path) as f:
                _mil_cache = json.load(f)
            logger.info(f"Military bases loaded: {len(_mil_cache)} facilities from static file")
            return {"count": len(_mil_cache), "data": _mil_cache}

    logger.error("military_bases.json not found — run: python scripts/generate_military_bases.py")
    raise HTTPException(503, "Military bases data not available. Run: python scripts/generate_military_bases.py")


# ── Undersea cables layer ──────────────────────────────────────────────────

_cables_cache = None
_cables_cache_time = 0
_CABLES_CACHE_TTL = 86400 * 7  # 7 days — cables don't change often

@app.get("/api/layers/undersea-cables")
async def undersea_cables():
    """
    Fetch submarine cable routes from TeleGeography's public API.
    Returns simplified line segments for rendering.
    Cached for 7 days.
    """
    global _cables_cache, _cables_cache_time

    if _cables_cache is not None and time.time() - _cables_cache_time < _CABLES_CACHE_TTL:
        logger.info(f"Undersea cables served from cache ({len(_cables_cache)} cables)")
        return {"count": len(_cables_cache), "data": _cables_cache}

    logger.info("Fetching undersea cables from TeleGeography...")
    try:
        async with httpx.AsyncClient(timeout=30.0, headers={"User-Agent": "SENTINEL/1.0"}) as client:
            resp = await client.get("https://www.submarinecablemap.com/api/v3/cable/cable-geo.json")
            resp.raise_for_status()
            geojson = resp.json()

        cables = []
        for feature in geojson.get("features", []):
            props = feature.get("properties", {})
            geom  = feature.get("geometry", {})
            if not props or not geom:
                continue

            # MultiLineString — each sub-array is one segment of the cable route
            coords_sets = geom.get("coordinates", [])
            if geom.get("type") == "LineString":
                coords_sets = [coords_sets]

            cables.append({
                "id":     props.get("id", ""),
                "name":   props.get("name", "Unknown Cable"),
                "color":  props.get("color", "#00D4D4"),
                "rfs":    props.get("rfs"),           # ready-for-service year
                "length": props.get("cable_length"),
                "owners": props.get("owners", []),
                "url":    props.get("url"),
                "coords": coords_sets,                 # list of line segments
            })

        _cables_cache = cables
        _cables_cache_time = time.time()
        logger.info(f"Undersea cables loaded: {len(cables)} cable systems")
        return {"count": len(cables), "data": cables}

    except Exception as e:
        logger.error(f"Undersea cables fetch failed: {e}")
        raise HTTPException(503, f"Could not fetch undersea cables: {e}")


# ── Data quality endpoint ──────────────────────────────────────────────────

@app.get("/api/quality")
async def data_quality(hours: int = Query(24, ge=1, le=168)):
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
