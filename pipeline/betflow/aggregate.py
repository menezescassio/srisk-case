"""Build the dashboard payload: dictionaries + columnar slip/leg tables.

The dashboard computes every view client-side from these tables so that a
single global filter state stays consistent across all views and every
number can drill to its underlying rows. Client-identifying values (unit
names, uids, the client's name and logo) exist only inside this payload,
which ships encrypted.

Column encoding notes:
- timestamps are epoch seconds (UTC)
- money is EUR rounded to 2dp
- categorical columns are integer indexes into `dims`
"""

from __future__ import annotations

import base64
import json
import re

import numpy as np
import pandas as pd

from .config import OUT_DIR, RAW_DIR

# The client's display name is derived from the raw unit names at runtime so
# it never appears as a literal in committed code (see guard.sh). The brand
# name is the dominant first word among multi-word unit names.
def _client_name(units: list[str]) -> str:
    from collections import Counter

    firsts = [u.split()[0] for u in units if len(u.split()) > 1]
    if not firsts:
        return "Client"
    return Counter(firsts).most_common(1)[0][0].title()


def _logo_b64() -> str | None:
    for name in ("client-logo.png", "logo.png"):
        p = RAW_DIR / name
        if p.exists():
            return base64.b64encode(p.read_bytes()).decode()
    # any png dropped in data/raw counts as the client logo
    pngs = sorted(RAW_DIR.glob("*.png"))
    if pngs:
        return base64.b64encode(pngs[0].read_bytes()).decode()
    return None


def _logo_svg_b64() -> str | None:
    """Dark-variant client mark for the web header. The source SVG centers the
    wordmark in a large square with lots of dead space, so crop the root
    viewBox to the inner <image> box and strip fixed width/height so it scales
    tight to any CSS height. Lives only in gitignored data/raw and ships inside
    the encrypted payload, never as committed plaintext."""
    svgs = sorted(RAW_DIR.glob("*-web.svg"))
    if not svgs:
        return None
    svg = svgs[0].read_text()
    m = re.search(
        r'<image[^>]*\bx="([\d.]+)"[^>]*\by="([\d.]+)"[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"',
        svg,
    )
    if m:
        x, y, w, h = m.groups()
        svg = re.sub(
            r'(<svg\b[^>]*?)\sviewBox="[^"]*"', rf'\1 viewBox="{x} {y} {w} {h}"', svg, count=1
        )
        svg = re.sub(r'(<svg\b[^>]*?)\swidth="[^"]*"', r"\1", svg, count=1)
        svg = re.sub(r'(<svg\b[^>]*?)\sheight="[^"]*"', r"\1", svg, count=1)
    return base64.b64encode(svg.encode()).decode()


def _dict_encode(series: pd.Series) -> tuple[list, list[int]]:
    cat = pd.Categorical(series.fillna(""))
    return list(cat.categories), [int(c) for c in cat.codes]


PHASE_ORDER = [
    "early pre-match",
    "day-of pre-match",
    "post-lineups (proxy)",
    "in-play",
]
CHANNELS = ["online", "retail", "tpv"]
BET_TYPES = ["SIMPLE", "COMBINED"]


def build_payload(slips: pd.DataFrame, legs: pd.DataFrame, recon: dict, risk: dict) -> dict:
    slips = slips.reset_index(drop=True)
    legs = legs.reset_index(drop=True)

    # ---- dims shared by slips and legs
    uid_cats, slip_uid = _dict_encode(slips["uid"])
    unit_cats, slip_unit = _dict_encode(slips["unit"])
    cur_cats, slip_cur = _dict_encode(slips["currency"])

    slip_index = {sid: i for i, sid in enumerate(slips["slip_id"])}

    # matches dim from legs
    m = (
        legs.groupby("match_id", dropna=False)
        .agg(
            name=("match", "first"),
            competition=("competition", "first"),
            kickoff=("event_ts", "min"),
        )
        .reset_index()
    )
    comp_cats, m_comp = _dict_encode(m["competition"])
    match_pos = {mid: i for i, mid in enumerate(m["match_id"])}

    market_df = (
        legs.groupby("market_clean")
        .agg(group=("market_group", "first"), star=("star_substitute", "first"))
        .reset_index()
    )
    market_pos = {mk: i for i, mk in enumerate(market_df["market_clean"])}

    option_cats, leg_option = _dict_encode(legs["option_raw"])
    player_cats, leg_player = _dict_encode(legs["entity_player"])
    team_cats, leg_team = _dict_encode(legs["entity_team"])

    def epoch(s: pd.Series) -> list[int]:
        return [int(v.timestamp()) if pd.notna(v) else -1 for v in s]

    payload = {
        "meta": {
            "client": _client_name(unit_cats),
            "logo_png_b64": _logo_b64(),
            "logo_svg_b64": _logo_svg_b64(),
            "recon": recon,
        },
        "risk": risk,
        "dims": {
            "uids": uid_cats,
            "units": unit_cats,
            "currencies": cur_cats,
            "competitions": comp_cats,
            "phases": PHASE_ORDER,
            "channels": CHANNELS,
            "bet_types": BET_TYPES,
            "options": option_cats,
            "players": player_cats,
            "teams": team_cats,
            "markets": {
                "name": market_df["market_clean"].tolist(),
                "group": market_df["group"].tolist(),
                "star": [bool(x) for x in market_df["star"]],
            },
            "matches": {
                "id": [int(x) if pd.notna(x) else -1 for x in m["match_id"]],
                "name": m["name"].tolist(),
                "competition": m_comp,
                "kickoff": epoch(m["kickoff"]),
            },
        },
        "slips": {
            "ts": epoch(slips["betslip_ts"]),
            "uid": slip_uid,
            "bet_type": [BET_TYPES.index(t) for t in slips["bet_type"]],
            "stake": slips["stake_eur"].round(2).tolist(),
            "ggr": slips["ggr_eur"].round(2).tolist(),
            "nr": slips["net_revenue_eur"].round(4).tolist(),
            "n_legs": slips["n_legs"].astype(int).tolist(),
            # combined price = product of leg prices; zero-stake artifact
            # groups can have hundreds of legs, making the product meaningless
            # or infinite. Anything implausible is encoded as -1 (undefined).
            "price": slips["price"]
            .where(np.isfinite(slips["price"]) & (slips["price"] <= 10_000), -1)
            .round(2)
            .tolist(),
            "phase": [PHASE_ORDER.index(p) for p in slips["phase"]],
            "lead_min": slips["lead_minutes"].round(0).where(slips["lead_minutes"].notna(), -99999).astype(int).tolist(),
            "unit": slip_unit,
            "channel": [CHANNELS.index(c) for c in slips["channel"]],
            "currency": slip_cur,
        },
        "legs": {
            "slip": [slip_index[s] for s in legs["slip_id"]],
            "match": [match_pos.get(mid, -1) for mid in legs["match_id"]],
            "market": [market_pos[mk] for mk in legs["market_clean"]],
            "option": leg_option,
            "player": leg_player,
            "team": leg_team,
            "price": legs["price"].round(3).where(legs["price"].notna(), -1).tolist(),
            "line": legs["line"].where(legs["line"].notna(), -1).astype(float).tolist(),
            "ts": epoch(legs["betslip_ts"]),
            "event_ts": epoch(legs["event_ts"]),
        },
    }
    return payload


def write_payload(payload: dict) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / "payload.json"
    out.write_text(json.dumps(payload, separators=(",", ":"), allow_nan=False))
    print(f"wrote {out} ({out.stat().st_size / 1e6:.1f} MB plaintext)")
