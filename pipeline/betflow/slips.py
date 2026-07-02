"""Roll leg-level rows up to betslips.

Verified against the raw data (QA report has the numbers):

- COMBINED rows are legs of a multiple; each leg carries the SLIP's stake,
  GGR and Net Revenue repeated (98.7% of same-second groups show a single
  stake; 95% a single GGR). Summing raw rows therefore overcounts combined
  turnover by the average legs-per-slip factor.
- There is no betslip id, so the slip is a proxy:
  (uid, betslip_ts, stake, ggr, net_revenue). Distinct settlement values
  separate same-second slips with the same stake; two IDENTICAL slips placed
  the same second by the same customer collapse into one. That residual
  ambiguity is quantified in the QA report, not silently ignored.
- SIMPLE rows are one slip per row, always (an identical repeated SIMPLE row
  is kept as a genuine repeated bet; the export has no mechanical reason to
  duplicate a single-leg billing row, unlike leg enumeration).
"""

from __future__ import annotations

import pandas as pd

SLIP_KEY = ["uid", "betslip_ts", "stake", "ggr", "net_revenue"]


def build_slips(legs: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (slips, legs_with_slip_id)."""
    legs = legs.copy()
    is_combined = legs["bet_type"] == "COMBINED"

    combined = legs[is_combined].copy()
    grp = combined.groupby(SLIP_KEY, dropna=False, sort=False)
    combined["slip_id"] = "C" + grp.ngroup().astype(str)

    simple = legs[~is_combined].copy()
    simple["slip_id"] = "S" + simple["row_id"].astype(str)

    legs_out = pd.concat([simple, combined]).sort_values("row_id")

    agg_first = [
        "uid", "betslip_ts", "bet_type", "unit", "unit_country", "channel",
        "currency", "currency_inferred", "source",
        "stake", "ggr", "net_revenue", "stake_eur", "ggr_eur", "net_revenue_eur",
    ]
    slips = (
        legs_out.groupby("slip_id", sort=False)
        .agg(
            **{c: (c, "first") for c in agg_first},
            n_legs=("row_id", "size"),
            n_matches=("match_id", "nunique"),
            first_event_ts=("event_ts", "min"),
            last_event_ts=("event_ts", "max"),
            competitions=("competition", lambda s: s.nunique()),
            combined_price=("price", "prod"),
        )
        .reset_index()
    )
    # for SIMPLE slips the struck price is the leg price, not a product of one
    slips = slips.rename(columns={"combined_price": "price"})
    return slips, legs_out


def duplicate_ambiguity(legs: pd.DataFrame) -> dict:
    """Quantify rows/turnover affected by exact-duplicate rows, the residual
    ambiguity the slip proxy cannot resolve (no betslip id in the export)."""
    cols = [c for c in legs.columns if c not in ("row_id", "source", "slip_id")]
    key = legs[cols].astype("string").fillna("NULL").agg("|".join, axis=1)
    dup_mask = key.duplicated(keep=False)
    dups = legs[dup_mask]
    return {
        "exact_dup_rows": int(dup_mask.sum()),
        "exact_dup_rows_simple": int((dups["bet_type"] == "SIMPLE").sum()),
        "exact_dup_rows_combined": int((dups["bet_type"] == "COMBINED").sum()),
        "exact_dup_stake_eur": float(dups["stake_eur"].sum()),
    }
