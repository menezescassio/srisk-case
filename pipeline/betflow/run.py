"""Pipeline entry point: raw exports -> clean slip/leg tables + QA report.

Usage: uv run python -m betflow.run   (from pipeline/)
"""

from __future__ import annotations

import json

import pandas as pd

from .aggregate import build_payload, write_payload
from .config import DATA_START, FILES, OUT_DIR
from .dedup import dedupe
from .findings import build_findings
from .ingest import load_export
from .normalize import normalize
from .phases import classify_phases
from .qa import build_recon_payload, write_qa_report
from .risk import build_risk
from .slips import build_slips, duplicate_ambiguity


def main() -> None:
    print("loading exports...")
    a = load_export(FILES["A"]["path"], "A")
    b = load_export(FILES["B"]["path"], "B")
    print(f"  A: {len(a):,} rows | B: {len(b):,} rows")

    print("dedup + union...")
    union, recon = dedupe(a, b)
    print(f"  union: {recon.union_rows:,} rows (overlap {recon.overlap_rows:,}, settlement conflicts {recon.settlement_conflicts:,})")

    print("normalizing...")
    legs = normalize(union)

    print("building slips...")
    slips, legs = build_slips(legs)
    slips = classify_phases(slips)

    # Data-window cut (slip-level, so the excluded figure matches the slip-level
    # basis used everywhere): drop sparse pre-tournament test/warm-up traffic so
    # every surface reports the same clean window (documented in the QA report).
    start = pd.Timestamp(DATA_START)
    pre = slips[slips["betslip_ts"] < start]
    excluded = {
        "rows": int(len(pre)),
        "stake_eur": round(float(pre["stake_eur"].sum()), 2),
        "rule": f"betslip date before {DATA_START} (pre-tournament test/warm-up)",
    }
    slips = slips[slips["betslip_ts"] >= start].copy()
    legs = legs[legs["slip_id"].isin(set(slips["slip_id"]))].copy()
    print(
        f"  data window >= {DATA_START}: dropped {excluded['rows']:,} pre-tournament "
        f"slips ({excluded['stake_eur']:,.0f} EUR)"
    )

    dup_stats = duplicate_ambiguity(legs)
    print(f"  slips: {len(slips):,} | legs: {len(legs):,}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    slips.to_parquet(OUT_DIR / "slips.parquet", index=False)
    legs.to_parquet(OUT_DIR / "legs.parquet", index=False)

    recon_payload = build_recon_payload(recon, legs, slips, dup_stats)
    recon_payload["excluded_pretournament"] = excluded
    write_qa_report(recon_payload)

    print("computing risk layer (proxy CLV, sharpness, anomalies)...")
    risk = build_risk(slips, legs)
    print(
        f"  eligible customers: {risk['assumptions']['eligible_customers']:,} | "
        f"watchlist: {len(risk['watchlist'])} | anomalies: {len(risk['anomalies'])}"
    )

    print("writing findings...")
    findings = build_findings(slips, legs, recon_payload, risk)
    (OUT_DIR / "findings.json").write_text(json.dumps(findings, indent=2))

    print("building dashboard payload...")
    payload_doc = build_payload(slips, legs, recon_payload, risk)
    payload_doc["findings"] = findings
    write_payload(payload_doc)
    payload = recon_payload

    print("\nheadline (slip-level, EUR):")
    print(f"  turnover   {payload['turnover_eur']:>14,.0f}")
    print(f"  GGR        {payload['ggr_eur']:>14,.0f}")
    print(f"  margin     {payload['margin_pct']:>13.2f}%")
    print(f"  net rev    {payload['net_revenue_eur']:>14,.0f}")
    print(f"  slips      {payload['slips']:>14,}")
    print(f"  customers  {payload['unique_customers']:>14,}")
    print(f"  window     {payload['betslip_min'][:10]} to {payload['betslip_max'][:10]}")
    print(f"\nwrote {OUT_DIR}/slips.parquet, legs.parquet, recon.json, qa_report.md")


if __name__ == "__main__":
    main()
