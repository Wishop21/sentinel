"""
SENTINEL — Vessel classification pipeline

Uses AIS vessel type codes (self-reported) as the primary signal.
MMSI country prefix provides nationality as secondary context.

Important limitation: military vessels frequently do not broadcast AIS,
or broadcast with incorrect/missing type codes. 'unknown' is honest here.

backend/classify/vessels.py implements the classification logic.
"""

import pandas as pd


# AIS vessel type code → (classification, confidence)
# Source: ITU-R M.1371-5 Appendix 8
TYPE_MAP = {
    # Military
    35: ("military",   "medium"),  # Military ops (self-reported — often absent)

    # Passenger
    60: ("civilian",   "high"),
    61: ("civilian",   "high"),
    62: ("civilian",   "high"),
    63: ("civilian",   "high"),
    64: ("civilian",   "high"),
    65: ("civilian",   "high"),
    66: ("civilian",   "high"),
    67: ("civilian",   "high"),
    68: ("civilian",   "high"),
    69: ("civilian",   "high"),

    # Cargo
    70: ("commercial", "high"),
    71: ("commercial", "high"),
    72: ("commercial", "high"),
    73: ("commercial", "high"),
    74: ("commercial", "high"),
    75: ("commercial", "high"),
    76: ("commercial", "high"),
    77: ("commercial", "high"),
    78: ("commercial", "high"),
    79: ("commercial", "high"),

    # Tanker
    80: ("commercial", "high"),
    81: ("commercial", "high"),
    82: ("commercial", "high"),
    83: ("commercial", "high"),
    84: ("commercial", "high"),
    85: ("commercial", "high"),
    86: ("commercial", "high"),
    87: ("commercial", "high"),
    88: ("commercial", "high"),
    89: ("commercial", "high"),

    # Fishing
    30: ("commercial", "high"),

    # Pleasure / sailing
    36: ("civilian",   "high"),
    37: ("civilian",   "high"),

    # SAR / pilot / tug
    50: ("government", "medium"),
    51: ("government", "medium"),
    52: ("civilian",   "medium"),
    53: ("government", "medium"),
    55: ("government", "medium"),
}


def _classify_single(row: pd.Series) -> tuple[str, str]:
    vessel_type = row.get("vessel_type")
    try:
        type_int = int(vessel_type)
        if type_int in TYPE_MAP:
            return TYPE_MAP[type_int]
        # Decade-level fallback
        decade = (type_int // 10) * 10
        if decade in TYPE_MAP:
            cls, _ = TYPE_MAP[decade]
            return cls, "low"
    except (TypeError, ValueError):
        pass

    return "unknown", "unknown"


def classify_vessel(df: pd.DataFrame) -> pd.DataFrame:
    """Enrich vessel DataFrame with classification and confidence columns."""
    results = df.apply(_classify_single, axis=1, result_type="expand")
    results.columns = ["classification", "confidence"]
    return pd.concat([df, results], axis=1)
