"""QA report: reconciliation, decisions and their quantified impact.

Writes pipeline/out/qa_report.md (local only, gitignored) plus a
machine-readable recon.json the dashboard reuses so the reconciliation
numbers shown to the reader are the pipeline's own.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pandas as pd

from .config import FX_AS_OF, FX_TO_EUR, LINEUP_PROXY_MIN, OUT_DIR
from .dedup import Reconciliation


def build_recon_payload(
    recon: Reconciliation,
    legs: pd.DataFrame,
    slips: pd.DataFrame,
    dup_stats: dict,
) -> dict:
    phase_counts = (
        slips.groupby("phase")["stake_eur"].agg(["count", "sum"]).round(2)
    )
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "files": recon.per_file,
        "overlap_rows": recon.overlap_rows,
        "settlement_conflicts": recon.settlement_conflicts,
        "conflict_ggr_before": round(recon.conflict_ggr_before, 2),
        "conflict_ggr_after": round(recon.conflict_ggr_after, 2),
        "union_rows": recon.union_rows,
        "slips": int(len(slips)),
        "slips_simple": int((slips["bet_type"] == "SIMPLE").sum()),
        "slips_combined": int((slips["bet_type"] == "COMBINED").sum()),
        # Totals are computed from per-slip values rounded to the same
        # precision the dashboard payload carries, so every surface (pipeline
        # stdout, QA report, dashboard, PDF) sums identical numbers.
        "turnover_eur": round(float(slips["stake_eur"].round(2).sum()), 2),
        "ggr_eur": round(float(slips["ggr_eur"].round(2).sum()), 2),
        "net_revenue_eur": round(float(slips["net_revenue_eur"].round(4).sum()), 2),
        "margin_pct": round(
            float(
                slips["ggr_eur"].round(2).sum()
                / slips["stake_eur"].round(2).sum()
                * 100
            ),
            2,
        ),
        "raw_rows_turnover_eur": round(float(legs["stake_eur"].sum()), 2),
        "raw_rows_ggr_eur": round(float(legs["ggr_eur"].sum()), 2),
        "unique_customers": int(slips["uid"].nunique()),
        "betslip_min": str(slips["betslip_ts"].min()),
        "betslip_max": str(slips["betslip_ts"].max()),
        "currency_rows_inferred": int(legs["currency_inferred"].sum()),
        "fx": {"as_of": FX_AS_OF, "rates_to_eur": FX_TO_EUR},
        "duplicate_ambiguity": dup_stats,
        "phases": {
            str(k): {"slips": int(v["count"]), "stake_eur": float(v["sum"])}
            for k, v in phase_counts.iterrows()
        },
        "lineup_proxy_minutes": LINEUP_PROXY_MIN,
    }


def write_qa_report(payload: dict) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "recon.json").write_text(json.dumps(payload, indent=2))

    f = payload["files"]
    md = [
        "# Betflow pipeline QA report",
        "",
        f"Generated {payload['generated_at']} (local only, never committed).",
        "",
        "## File reconciliation",
        "",
        "| | rows | raw-row turnover | raw-row GGR | betslip window |",
        "|---|---|---|---|---|",
    ]
    for name, s in f.items():
        md.append(
            f"| {name} | {s['rows']:,} | {s['turnover_raw_rows']:,.0f} | "
            f"{s['ggr_raw_rows']:,.0f} | {s['betslip_min'][:10]} to {s['betslip_max'][:10]} |"
        )
    md += [
        f"| union | {payload['union_rows']:,} | {payload['raw_rows_turnover_eur']:,.0f} EUR | {payload['raw_rows_ggr_eur']:,.0f} EUR | {payload['betslip_min'][:10]} to {payload['betslip_max'][:10]} |",
        "",
        f"- Cross-file overlapping rows (bet identity + occurrence): **{payload['overlap_rows']:,}**",
        f"- Settlement conflicts on the overlap (B wins): **{payload['settlement_conflicts']:,}**, GGR {payload['conflict_ggr_before']:,.0f} -> {payload['conflict_ggr_after']:,.0f}",
        "",
        "## Slip rollup (the material correction)",
        "",
        f"- Union rows: {payload['union_rows']:,} -> slips: **{payload['slips']:,}** "
        f"({payload['slips_simple']:,} SIMPLE + {payload['slips_combined']:,} COMBINED)",
        f"- Turnover: raw-row sum {payload['raw_rows_turnover_eur']:,.0f} EUR -> slip-level **{payload['turnover_eur']:,.0f} EUR**",
        f"- GGR: raw-row sum {payload['raw_rows_ggr_eur']:,.0f} EUR -> slip-level **{payload['ggr_eur']:,.0f} EUR**",
        f"- Blended margin (slip-level): **{payload['margin_pct']:.2f}%**",
        f"- Unique customers: {payload['unique_customers']:,}",
        "",
        "## Residual duplicate ambiguity (no betslip id in export)",
        "",
        f"- Exact duplicate rows: {payload['duplicate_ambiguity']['exact_dup_rows']:,} "
        f"(SIMPLE {payload['duplicate_ambiguity']['exact_dup_rows_simple']:,}, "
        f"COMBINED {payload['duplicate_ambiguity']['exact_dup_rows_combined']:,}), "
        f"raw stake {payload['duplicate_ambiguity']['exact_dup_stake_eur']:,.0f} EUR",
        "- Treatment: SIMPLE duplicates kept as repeated bets; identical same-second COMBINED slips merge into one slip proxy. Upper bound on undercount available by max-multiplicity sensitivity.",
        "",
        "## Currency",
        "",
        f"- Rows with inferred currency (null code, unit geography): {payload['currency_rows_inferred']:,}",
        f"- Fixed FX as of {payload['fx']['as_of']}: "
        + ", ".join(f"{k}={1/v:.3f} per EUR" if v != 1 else "EUR=1" for k, v in payload["fx"]["rates_to_eur"].items()),
        "",
        "## Timing phases (slips)",
        "",
        "| phase | slips | stake EUR |",
        "|---|---|---|",
    ]
    for k, v in payload["phases"].items():
        md.append(f"| {k} | {v['slips']:,} | {v['stake_eur']:,.0f} |")
    md += [
        "",
        f"Post-lineups proxy = final {payload['lineup_proxy_minutes']} minutes before first kickoff (no lineup timestamps in the data).",
        "",
    ]
    (OUT_DIR / "qa_report.md").write_text("\n".join(md))
