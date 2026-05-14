"""
SENTINEL — Satellite classification pipeline

Classification is more reliable here than for aircraft because:
  - CelesTrak provides object type (PAYLOAD, ROCKET BODY, DEBRIS)
  - Constellation membership is deterministic from TLE group
  - Owner/operator is often encoded in the satellite name

Classification categories:
  - military      (GPS, GLONASS military birds, known defense satellites)
  - commercial    (Starlink, OneWeb, Iridium, commercial comms)
  - civil         (ESA, ISRO science missions, weather sats)
  - navigation    (GPS, GLONASS, Galileo, BeiDou)
  - crewed        (ISS, Tiangong, Crew Dragon)
  - debris        (defunct objects, rocket bodies)
  - unknown

  backend/classify/satellites.py implements the classification logic.
"""

import pandas as pd

# Group → classification mapping (deterministic from TLE source)
GROUPS = {
    "stations":    "https://celestrak.org/SOCRATES/query.php?GROUP=stations&FORMAT=TLE",
    "starlink":    "https://celestrak.org/SOCRATES/query.php?GROUP=starlink&FORMAT=TLE",
    "oneweb":      "https://celestrak.org/SOCRATES/query.php?GROUP=oneweb&FORMAT=TLE",
    "gps-ops":     "https://celestrak.org/SOCRATES/query.php?GROUP=gps-ops&FORMAT=TLE",
    "glonass-ops": "https://celestrak.org/SOCRATES/query.php?GROUP=glonass-ops&FORMAT=TLE",
    "galileo":     "https://celestrak.org/SOCRATES/query.php?GROUP=galileo&FORMAT=TLE",
    "active":      "https://celestrak.org/SOCRATES/query.php?GROUP=active&FORMAT=TLE",
}


# Name patterns for military satellites
MILITARY_NAME_PATTERNS = [
    "USA",      # US military (NROL, etc.)
    "NROL",
    "MUOS",     # Mobile User Objective System
    "WGS",      # Wideband Global SATCOM
    "AEHF",     # Advanced Extremely High Frequency
    "SBIRS",    # Space-Based Infrared System
    "COSMOS",   # Russian military (many are)
    "MERIDIAN",
    "RADUGA",
    "LUCH",
    "GLONASS",  # Navigation/military dual-use
]

# Name patterns for civil/science satellites
CIVIL_NAME_PATTERNS = [
    "SENTINEL",  # ESA Copernicus
    "LANDSAT",
    "TERRA",
    "AQUA",
    "METOP",
    "NOAA",
    "GOES",
    "METEOR",
    "RESURS",
    "HUBBLE",
    "JWST",
    "CHEOPS",
    "SWARM",
]

GROUP_CLASSIFICATION = {
    "stations":    ("crewed",     "high"),
    "starlink":    ("commercial", "high"),
    "oneweb":      ("commercial", "high"),
    "gps-ops":     ("navigation", "high"),
    "glonass-ops": ("navigation", "high"),
    "galileo":     ("navigation", "high"),
}

def _classify_single(row: pd.Series) -> tuple[str, str]:
    """Classify a single satellite. Returns (classification, confidence)."""
    group = row.get("group", "")
    name = str(row.get("name", "")).upper()

    # 1. Group-based classification — highest confidence
    if group in GROUP_CLASSIFICATION:
        return GROUP_CLASSIFICATION[group]

    # 2. Name pattern matching
    for pattern in MILITARY_NAME_PATTERNS:
        if pattern in name:
            return "military", "medium"

    for pattern in CIVIL_NAME_PATTERNS:
        if pattern in name:
            return "civil", "medium"

    # 3. Debris / rocket body from name conventions
    if any(x in name for x in ["DEB", "R/B", "DEBRIS", "ROCKET"]):
        return "debris", "medium"

    return "unknown", "unknown"


def classify_satellite(df: pd.DataFrame) -> pd.DataFrame:
    """Enrich satellite DataFrame with classification columns."""
    results = df.apply(_classify_single, axis=1, result_type="expand")
    results.columns = ["classification", "confidence"]
    return pd.concat([df, results], axis=1)
