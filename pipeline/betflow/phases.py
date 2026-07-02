"""Timing-phase classification per slip.

Phase is measured from the slip's FIRST kickoff (earliest event among its
legs, all UTC). Assumption stated everywhere it surfaces: lineups have no
timestamp in the data, so "post-lineups" is the final 75 minutes before
kickoff, the window in which team sheets are public.
"""

from __future__ import annotations

import pandas as pd

from .config import DAY_OF_MIN, INPLAY_MAX_MIN, LINEUP_PROXY_MIN

PHASES = [
    "early pre-match",
    "day-of pre-match",
    "post-lineups (proxy)",
    "in-play",
    "suspect timing",
]


def classify_phases(slips: pd.DataFrame) -> pd.DataFrame:
    lead_min = (
        slips["first_event_ts"] - slips["betslip_ts"]
    ).dt.total_seconds() / 60.0
    slips["lead_minutes"] = lead_min

    phase = pd.Series("early pre-match", index=slips.index, dtype="string")
    phase[lead_min <= DAY_OF_MIN] = "day-of pre-match"
    phase[lead_min <= LINEUP_PROXY_MIN] = "post-lineups (proxy)"
    phase[lead_min < 0] = "in-play"
    # placed after the earliest match should have finished, or missing kickoff
    phase[lead_min < -INPLAY_MAX_MIN] = "suspect timing"
    phase[slips["first_event_ts"].isna() | slips["betslip_ts"].isna()] = (
        "suspect timing"
    )
    slips["phase"] = phase
    return slips
