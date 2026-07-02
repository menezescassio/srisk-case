"""Read the raw Excel exports into typed frames.

Real headers sit on Excel row 5; the first column is an unnamed index the
report writer adds. All timestamps are dd/mm/yyyy HH:MM:SS strings in UTC.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

CANONICAL_COLUMNS = [
    "Sport",
    "Competition",
    "MatchId",
    "MATCH",
    "Event date (utc)",
    "Market",
    "BetType",
    "Player",
    "Option",
    "Betslip date (utc)",
    "Uid",
    "Management unit",
    "Price",
    "TURNOVER",
    "GGR",
    "Net Revenue",
    "Currency Code",
]

RENAME = {
    "Sport": "sport",
    "Competition": "competition",
    "MatchId": "match_id",
    "MATCH": "match",
    "Event date (utc)": "event_ts",
    "Market": "market_raw",
    "BetType": "bet_type",
    "Player": "player_raw",
    "Option": "option_raw",
    "Betslip date (utc)": "betslip_ts",
    "Uid": "uid",
    "Management unit": "unit",
    "Price": "price",
    "TURNOVER": "stake",
    "GGR": "ggr",
    "Net Revenue": "net_revenue",
    "Currency Code": "currency_raw",
}

STRING_COLS = ["sport", "competition", "match", "market_raw", "bet_type", "player_raw", "option_raw", "uid", "unit", "currency_raw"]


def load_export(path: Path, source: str) -> pd.DataFrame:
    """Load one export; returns a typed frame with a `source` column."""
    df = pd.read_excel(path, sheet_name="Sample1", header=4)
    df = df.drop(columns=[c for c in df.columns if str(c).startswith("Unnamed")])
    missing = [c for c in CANONICAL_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"{path.name}: missing expected columns {missing}")
    df = df[CANONICAL_COLUMNS].rename(columns=RENAME)

    for col in STRING_COLS:
        df[col] = df[col].astype("string").str.strip()

    df["event_ts"] = pd.to_datetime(df["event_ts"], dayfirst=True, errors="coerce")
    df["betslip_ts"] = pd.to_datetime(df["betslip_ts"], dayfirst=True, errors="coerce")
    for col in ["price", "stake", "ggr", "net_revenue"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["match_id"] = pd.to_numeric(df["match_id"], errors="coerce").astype("Int64")
    df["source"] = source
    return df
