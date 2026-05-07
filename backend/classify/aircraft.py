"""
SENTINEL — Aircraft classification pipeline

Classification approach (in priority order):
  1. ICAO 24-bit address falls in a known military block → HIGH confidence
  2. Callsign matches a known military pattern → MEDIUM confidence
  3. Operator database maps ICAO hex to a known military operator → MEDIUM confidence
  4. Aircraft category field indicates specific type → LOW-MEDIUM confidence
  5. No match → UNKNOWN

Classification categories:
  - military
  - commercial   (scheduled airlines)
  - cargo        (freight operators)
  - general      (private/GA aircraft)
  - government   (non-military state aircraft)
  - unknown

This module is deliberately transparent about its limitations.
Coverage gaps are expected, especially over regions with sparse ADS-B receivers.
"""

import re
import logging
import pandas as pd

logger = logging.getLogger(__name__)

# ── Military ICAO hex ranges ───────────────────────────────────────────────
# These are publicly documented allocations to military organisations.
# Source: ICAO Annex 10, national CAA publications, OpenSky research papers.
# This is not exhaustive — many military aircraft use civilian registrations
# or do not broadcast ADS-B at all.
MILITARY_ICAO_RANGES = [
    # United States military
    ("ADF7C7", "ADF7C7"),  # USAF specific
    ("AE0000", "AFFFFF"),  # US military block (large)
    # United Kingdom
    ("43C000", "43CFFF"),  # RAF
    # France
    ("3B0000", "3BFFFF"),  # French military (partial)
    # Germany
    ("347000", "3473FF"),  # Luftwaffe
    # Russia (known military ranges — incomplete by design)
    ("100000", "1FFFFF"),  # Russian Federation (mixed civil/military)
    # NATO AWACS
    ("499F00", "499FFF"),
]

# ── Military callsign patterns ─────────────────────────────────────────────
# Common prefixes used by military operators. Not exhaustive.
MILITARY_CALLSIGN_PATTERNS = [
    r"^RRR",      # RAF
    r"^REACH",    # USAF Air Mobility Command
    r"^EVAC",     # USAF aeromedical
    r"^JAKE",     # USAF
    r"^BLADE",    # UK military helicopter
    r"^IRON",     # RAF fast jet training
    r"^ASCOT",    # RAF Air Transport
    r"^NATO",     # NATO aircraft
    r"^TOPCAT",   # US Navy
    r"^CONVOY",   # Military logistics
    r"^MAGMA",    # UK special operations
]

# ── Known cargo operators (ICAO operator codes) ────────────────────────────
CARGO_OPERATORS = {
    "FDX", "UPS", "DHL", "CLX", "KZR", "GTI", "NPT",
    "ABX", "ATN", "PAC", "FDE", "BOX",
}

# ── Known commercial airline prefixes (ICAO codes, 3-letter) ──────────────
# A non-exhaustive list of major scheduled carriers
COMMERCIAL_OPERATORS = {
    "BAW", "UAL", "AAL", "DAL", "SWA", "RYR", "EZY", "AFR",
    "DLH", "KLM", "IBE", "TAP", "SAS", "FIN", "THY", "ETD",
    "UAE", "QTR", "SIA", "CPA", "ANA", "JAL", "QFA", "BAW",
    "VIR", "TOM", "MON", "EXS", "TCX", "WZZ", "VLG", "BEL",
    "CFG", "TUI",
}

# Pre-compile military callsign regex for performance
_MILITARY_RE = re.compile("|".join(MILITARY_CALLSIGN_PATTERNS), re.IGNORECASE)


def _icao_in_military_range(icao_hex: str) -> bool:
    """Check if an ICAO 24-bit address falls within a known military block."""
    try:
        icao_int = int(icao_hex.upper(), 16)
        for start, end in MILITARY_ICAO_RANGES:
            if int(start, 16) <= icao_int <= int(end, 16):
                return True
    except (ValueError, TypeError):
        pass
    return False


def _classify_single(row: pd.Series) -> tuple[str, str]:
    """
    Classify a single aircraft. Returns (classification, confidence).
    Confidence: 'high' | 'medium' | 'low' | 'unknown'
    """
    icao = str(row.get("icao24", "")).strip()
    callsign = str(row.get("callsign", "")).strip()
    operator_prefix = callsign[:3].upper() if len(callsign) >= 3 else ""

    # 1. ICAO hex range check — highest confidence
    if icao and _icao_in_military_range(icao):
        return "military", "high"

    # 2. Callsign pattern — medium confidence
    if callsign and _MILITARY_RE.match(callsign):
        return "military", "medium"

    # 3. Operator prefix from callsign
    if operator_prefix in CARGO_OPERATORS:
        return "cargo", "medium"

    if operator_prefix in COMMERCIAL_OPERATORS:
        return "commercial", "medium"

    # 4. Aircraft category field (when available from OpenSky extended mode)
    category = row.get("category")
    if pd.notna(category):
        cat = int(category)
        # OpenSky category codes: https://openskynetwork.github.io/opensky-api/rest.html
        if cat in (1,):    # No info
            pass
        elif cat in (2, 3):  # Light, small
            return "general", "low"
        elif cat in (4, 5):  # Large, heavy
            return "commercial", "low"  # Likely but not certain
        elif cat == 7:     # Rotorcraft
            return "general", "low"

    # 5. Origin country heuristic — weakest signal, low confidence only
    # We deliberately do NOT classify based on country alone — too unreliable.

    return "unknown", "unknown"


def classify_aircraft(df: pd.DataFrame) -> pd.DataFrame:
    """
    Enrich a DataFrame of aircraft state vectors with classification columns.
    Adds: 'classification', 'confidence'
    """
    results = df.apply(_classify_single, axis=1, result_type="expand")
    results.columns = ["classification", "confidence"]
    df = pd.concat([df, results], axis=1)

    # Log classification coverage for monitoring
    total = len(df)
    unknown = (df["classification"] == "unknown").sum()
    coverage_pct = round((1 - unknown / total) * 100, 1) if total > 0 else 0
    logger.debug(f"Aircraft classification coverage: {coverage_pct}% ({total - unknown}/{total})")

    return df
