"""Synthetic fixtures only. No client data, identifiers or unit names."""

from __future__ import annotations

import pandas as pd
import pytest


def make_leg(**overrides) -> dict:
    base = {
        "sport": "Football",
        "competition": "Test Cup",
        "match_id": 100,
        "match": "Alpha - Beta",
        "event_ts": pd.Timestamp("2026-06-15 18:00:00"),
        "market_raw": "Anytime goalscorer (Star Substitute)",
        "bet_type": "SIMPLE",
        "player_raw": "Goleador durante el partido (Suplente Estrella)",
        "option_raw": "Test Player",
        "betslip_ts": pd.Timestamp("2026-06-15 12:00:00"),
        "uid": "12345",
        "unit": "UNIT NORTH",
        "price": 3.5,
        "stake": 10.0,
        "ggr": 10.0,
        "net_revenue": 0.8,
        "currency_raw": "EUR",
        "source": "A",
    }
    base.update(overrides)
    return base


@pytest.fixture
def legs_frame():
    def build(rows: list[dict]) -> pd.DataFrame:
        df = pd.DataFrame(rows)
        for col in ["uid", "unit", "market_raw", "player_raw", "option_raw", "bet_type", "currency_raw", "match", "competition", "sport"]:
            df[col] = df[col].astype("string")
        df["row_id"] = range(len(df))
        return df

    return build
