"""Cross-file deduplication and reconciliation.

Verified facts driving the design (see QA report for the numbers):

- The two exports are two pulls of the same report made 95 seconds apart on
  2026-06-24, covering different betslip-date windows: A is dense up to
  2026-06-20, B from 2026-06-19 to 2026-06-23. They form adjacent windows
  with a seam, not a large duplication. Row-level overlap is a few thousand
  rows, concentrated on 2026-06-19/20.
- On the seam, the same bet can appear in both files with different GGR /
  Net Revenue (settlement moved between report runs or the report is
  inconsistent). The later pull (B) wins those conflicts.

Bet identity excludes the settlement columns: a bet is
(uid, betslip_ts, match_id, market, player, option, bet_type, price, stake)
plus an occurrence index, so a genuine repeated identical bet inside one
file is preserved, while the cross-file overlap counts once.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

IDENTITY_COLS = [
    "uid",
    "betslip_ts",
    "match_id",
    "market_raw",
    "player_raw",
    "option_raw",
    "bet_type",
    "price",
    "stake",
]


def _identity_key(df: pd.DataFrame) -> pd.Series:
    key = (
        df[IDENTITY_COLS]
        .astype("string")
        .fillna("NULL")
        .agg("|".join, axis=1)
    )
    occ = key.groupby(key).cumcount()
    return key + "#" + occ.astype(str)


@dataclass
class Reconciliation:
    per_file: dict = field(default_factory=dict)
    overlap_rows: int = 0
    settlement_conflicts: int = 0
    conflict_ggr_before: float = 0.0
    conflict_ggr_after: float = 0.0
    union_rows: int = 0


def dedupe(a: pd.DataFrame, b: pd.DataFrame) -> tuple[pd.DataFrame, Reconciliation]:
    """Union of the two pulls; B (later) wins settlement conflicts."""
    recon = Reconciliation()
    for name, df in [("A", a), ("B", b)]:
        recon.per_file[name] = {
            "rows": int(len(df)),
            "turnover_raw_rows": float(df["stake"].sum()),
            "ggr_raw_rows": float(df["ggr"].sum()),
            "betslip_min": str(df["betslip_ts"].min()),
            "betslip_max": str(df["betslip_ts"].max()),
        }

    a = a.assign(_bet_key=_identity_key(a))
    b = b.assign(_bet_key=_identity_key(b))

    shared = a[a["_bet_key"].isin(set(b["_bet_key"]))]
    recon.overlap_rows = int(len(shared))

    # settlement conflicts on the overlap: prefer B's GGR / Net Revenue
    b_settle = b.set_index("_bet_key")[["ggr", "net_revenue"]]
    a_idx = a.set_index("_bet_key")
    common = a_idx.index.intersection(b_settle.index)
    before = a_idx.loc[common, ["ggr", "net_revenue"]]
    after = b_settle.loc[common]
    diff_mask = (before["ggr"] != after["ggr"]) | (
        before["net_revenue"] != after["net_revenue"]
    )
    recon.settlement_conflicts = int(diff_mask.sum())
    recon.conflict_ggr_before = float(before.loc[diff_mask, "ggr"].sum())
    recon.conflict_ggr_after = float(after.loc[diff_mask, "ggr"].sum())
    a_idx.loc[common, ["ggr", "net_revenue"]] = after
    a = a_idx.reset_index()

    b_only = b[~b["_bet_key"].isin(set(a["_bet_key"]))]
    union = pd.concat([a, b_only], ignore_index=True)
    union = union.drop(columns=["_bet_key"])
    union["row_id"] = range(len(union))
    recon.union_rows = int(len(union))
    return union, recon
