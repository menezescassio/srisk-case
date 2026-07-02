"""Pipeline entry point: raw exports -> clean slip/leg tables + QA report.

Usage: uv run python -m betflow.run   (from pipeline/)
"""

from __future__ import annotations

from .config import FILES, OUT_DIR
from .dedup import dedupe
from .ingest import load_export
from .normalize import normalize
from .phases import classify_phases
from .qa import build_recon_payload, write_qa_report
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
    dup_stats = duplicate_ambiguity(legs)
    print(f"  slips: {len(slips):,} | legs: {len(legs):,}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    slips.to_parquet(OUT_DIR / "slips.parquet", index=False)
    legs.to_parquet(OUT_DIR / "legs.parquet", index=False)

    payload = build_recon_payload(recon, legs, slips, dup_stats)
    write_qa_report(payload)

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
