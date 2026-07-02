"""Pipeline configuration: paths, file registry, FX and timing assumptions.

Every constant here is an analytical decision that is documented in the QA
report and the written report. Change them here and everywhere follows.
"""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = REPO_ROOT / "data" / "raw"
OUT_DIR = REPO_ROOT / "pipeline" / "out"

# The two exports, keyed by a short id. Pull timestamps come from the file
# names (both pulled 2026-06-24, 95 seconds apart). B is the later pull and
# therefore wins settlement conflicts on bets present in both files.
FILES = {
    "A": {
        "path": RAW_DIR / "excel_BillingByBetslips-24062026_051729.xlsx",
        "pulled_at": "2026-06-24 05:17:29",
    },
    "B": {
        "path": RAW_DIR / "excel_BillingByBetslips-24062026_051904 (1).xlsx",
        "pulled_at": "2026-06-24 05:19:04",
    },
}
SETTLEMENT_PREFERENCE = "B"  # later pull wins GGR / Net Revenue conflicts

# Fixed FX reference rates as of 2026-06-23 (end of the data window).
# Source: exchange-rates.org daily history. PEN and USD volume is small
# (~3% of rows), so a fixed end-of-window rate is an acceptable simplification;
# stated as an assumption in the report.
FX_TO_EUR = {
    "EUR": 1.0,
    "PEN": 1.0 / 3.90,
    "USD": 1.0 / 1.138,
}
FX_AS_OF = "2026-06-23"

# Currency inference for rows with a null Currency Code: by unit geography.
# Unit names are client-identifying, so geography is matched by substring
# (see normalize.is_peru_unit) instead of listing unit names here.

# Timing phases (minutes before first kickoff of the slip's earliest leg).
# Post-lineups is a proxy: team sheets are typically public about an hour
# before kickoff and no lineup timestamps exist in the data, so we treat the
# final 60 minutes (roughly 1h before kickoff) as the post-lineups window.
# Stated as an assumption wherever it surfaces.
LINEUP_PROXY_MIN = 60
DAY_OF_MIN = 24 * 60

# Data window: activity before this date is sparse pre-tournament test/warm-up
# traffic on non-World-Cup fixtures (verified negligible: ~0.02% of turnover).
# Excluded from the analysis so every surface reports the same clean window.
DATA_START = "2026-06-01"

WORLD_CUP = "2026 FIFA World Cup"
