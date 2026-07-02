"""Timing-phase classification per slip.

Phase is measured from the slip's FIRST kickoff (earliest event among its
legs, all UTC). Assumption stated everywhere it surfaces: lineups have no
timestamp in the data, so "post-lineups" is the final 60 minutes (roughly 1h)
before kickoff, the window in which team sheets are typically public.

Edge timestamps are pushed to the real phases rather than a separate bucket:
a bet placed after kickoff is in-play no matter how late, and a bet with an
unusable timestamp (NaN lead) falls through to early pre-match.
"""

from __future__ import annotations

import pandas as pd

from .config import DAY_OF_MIN, LINEUP_PROXY_MIN

PHASES = [
    "early pre-match",
    "day-of pre-match",
    "post-lineups (proxy)",
    "in-play",
]


def classify_phases(slips: pd.DataFrame) -> pd.DataFrame:
    lead_min = (
        slips["first_event_ts"] - slips["betslip_ts"]
    ).dt.total_seconds() / 60.0
    slips["lead_minutes"] = lead_min

    # Default is early pre-match; a NaN lead (missing timestamp) fails every
    # comparison below and correctly stays here.
    phase = pd.Series("early pre-match", index=slips.index, dtype="string")
    phase[lead_min <= DAY_OF_MIN] = "day-of pre-match"
    phase[lead_min <= LINEUP_PROXY_MIN] = "post-lineups (proxy)"
    phase[lead_min < 0] = "in-play"
    slips["phase"] = phase
    return slips
