"""Risk layer: price-movement proxy, customer sharpness scoring, anomalies.

Everything here is a TRANSPARENT rule computed from the slip/leg tables; no
black boxes. Two loud limitations, repeated wherever these numbers surface:

- No odds history exists in the export. "Proxy CLV" compares a struck price
  with the LAST struck price on the same selection before kickoff, inside
  this client's own flow. It is an internal movement proxy, not true closing
  line value.
- There is no settlement detail beyond GGR per row, so "customer win rate"
  is the share of slips with negative operator GGR.

A selection is (match_id, market_clean, option). Legs priced <= 1.01 or
without kickoff are excluded from price analytics.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# eligibility thresholds (stated in the UI)
SEL_MIN_LEGS = 5
SEL_MIN_PRICES = 2
UID_MIN_SLIPS = 15
UID_MIN_STAKE_EUR = 150
UID_MIN_CLV_LEGS = 8

W_CLV = 0.30
W_WIN = 0.25
W_LINEUP = 0.15
W_STAKE = 0.15
W_FOCUS = 0.15


def _selection_frame(legs: pd.DataFrame) -> pd.DataFrame:
    """Per-leg frame restricted to price-analyzable legs, with selection key."""
    df = legs.copy()
    df["stake_attr"] = df.groupby("slip_id")["stake_eur"].transform("first") / df.groupby(
        "slip_id"
    )["stake_eur"].transform("size")
    df["ggr_attr"] = df.groupby("slip_id")["ggr_eur"].transform("first") / df.groupby(
        "slip_id"
    )["ggr_eur"].transform("size")
    ok = (
        (df["price"] > 1.01)
        & df["event_ts"].notna()
        & df["betslip_ts"].notna()
    )
    df = df[ok].copy()
    df["pre_ko"] = df["betslip_ts"] < df["event_ts"]
    df["sel_key"] = (
        df["match"].fillna("?")
        + " · "
        + df["market_clean"]
        + " · "
        + df["option_raw"].fillna("?")
    )
    return df


def price_proxy(legs: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (eligible_legs_with_clv, selection_stats)."""
    df = _selection_frame(legs)
    pre = df[df["pre_ko"]].sort_values("betslip_ts")

    g = pre.groupby("sel_key")
    sel = g.agg(
        match=("match", "first"),
        market=("market_clean", "first"),
        option=("option_raw", "first"),
        competition=("competition", "first"),
        n_legs=("price", "size"),
        n_uids=("uid", "nunique"),
        n_prices=("price", "nunique"),
        first_price=("price", "first"),
        last_price=("price", "last"),
        min_price=("price", "min"),
        max_price=("price", "max"),
        stake=("stake_attr", "sum"),
        ggr=("ggr_attr", "sum"),
        first_ts=("betslip_ts", "min"),
        last_ts=("betslip_ts", "max"),
        kickoff=("event_ts", "first"),
    )
    sel["exposure"] = g.apply(
        lambda x: float((x["stake_attr"] * (x["price"] - 1)).sum()),
        include_groups=False,
    )
    sel["eligible"] = (sel["n_legs"] >= SEL_MIN_LEGS) & (sel["n_prices"] >= SEL_MIN_PRICES)

    # proxy CLV per pre-KO leg on eligible selections
    ref = sel.loc[sel["eligible"], "last_price"]
    pre = pre[pre["sel_key"].isin(ref.index)].copy()
    pre["ref_price"] = pre["sel_key"].map(ref)
    pre["proxy_clv"] = pre["price"] / pre["ref_price"] - 1.0
    return pre, sel.reset_index()


def sharpness(slips: pd.DataFrame, clv_legs: pd.DataFrame) -> pd.DataFrame:
    """Per-Uid transparent sharpness score over eligible customers."""
    g = slips.groupby("uid")
    u = g.agg(
        slips=("slip_id", "size"),
        stake=("stake_eur", "sum"),
        ggr=("ggr_eur", "sum"),
        avg_stake=("stake_eur", "mean"),
        channel=("channel", "first"),
        n_units=("unit", "nunique"),
    )
    u["customer_margin"] = np.where(u["stake"] > 0, -u["ggr"] / u["stake"], 0.0)
    u["win_rate"] = g.apply(
        lambda x: float((x["ggr_eur"] < 0).mean()), include_groups=False
    )

    phase_stake = slips.pivot_table(
        index="uid", columns="phase", values="stake_eur", aggfunc="sum"
    ).fillna(0.0)
    u["lineup_share"] = phase_stake.get("post-lineups (proxy)", 0.0) / u["stake"]
    u["inplay_share"] = phase_stake.get("in-play", 0.0) / u["stake"]

    # market focus: HHI across market groups of the customer's legs
    # (passed in via clv_legs' parent frame is insufficient; recomputed later
    # by caller and merged: see build_risk)

    # proxy CLV per uid (stake-weighted). Guard the empty case: an empty
    # groupby-apply returns the input's columns, which would collide with u on
    # join. When no price-eligible legs exist, fall back to empty clv columns.
    if len(clv_legs):
        c = clv_legs.groupby("uid").apply(
            lambda x: pd.Series(
                {
                    "clv": float(np.average(x["proxy_clv"], weights=np.maximum(x["stake_attr"], 0.01))),
                    "clv_legs": int(len(x)),
                }
            ),
            include_groups=False,
        )
    else:
        c = pd.DataFrame(columns=["clv", "clv_legs"])
    u = u.join(c[["clv", "clv_legs"]], how="left")
    u["clv_legs"] = u["clv_legs"].fillna(0).astype(int)

    eligible = (u["slips"] >= UID_MIN_SLIPS) & (u["stake"] >= UID_MIN_STAKE_EUR)
    e = u[eligible].copy()

    def pctl(s: pd.Series) -> pd.Series:
        return s.rank(pct=True, method="average").fillna(0.5)

    clv_component = pctl(e["clv"])
    clv_component[e["clv_legs"] < UID_MIN_CLV_LEGS] = 0.5  # not enough evidence
    e["clv_pctl"] = clv_component
    e["win_pctl"] = pctl(e["customer_margin"])
    e["lineup_pctl"] = pctl(e["lineup_share"])
    e["stake_pctl"] = pctl(e["avg_stake"])
    return e


def build_risk(slips: pd.DataFrame, legs: pd.DataFrame) -> dict:
    clv_legs, sel = price_proxy(legs)
    e = sharpness(slips, clv_legs)

    # market focus HHI per uid from leg stake attribution
    df = legs.copy()
    df["stake_attr"] = df.groupby("slip_id")["stake_eur"].transform("first") / df.groupby(
        "slip_id"
    )["stake_eur"].transform("size")
    by = df.groupby(["uid", "market_group"])["stake_attr"].sum().reset_index()
    tot = by.groupby("uid")["stake_attr"].transform("sum")
    by["share"] = by["stake_attr"] / tot
    hhi = by.groupby("uid").apply(
        lambda x: float((x["share"] ** 2).sum()), include_groups=False
    )
    top_group = by.sort_values("share").groupby("uid").last()[["market_group", "share"]]

    e = e.join(hhi.rename("hhi"), how="left")
    e = e.join(top_group.rename(columns={"market_group": "top_group", "share": "top_group_share"}), how="left")
    e["hhi"] = e["hhi"].fillna(0.0)

    def pctl(s: pd.Series) -> pd.Series:
        return s.rank(pct=True, method="average").fillna(0.5)

    e["focus_pctl"] = pctl(e["hhi"])
    e["score"] = (
        100
        * (
            W_CLV * e["clv_pctl"]
            + W_WIN * e["win_pctl"]
            + W_LINEUP * e["lineup_pctl"]
            + W_STAKE * e["stake_pctl"]
            + W_FOCUS * e["focus_pctl"]
        )
    ).round(1)
    e = e.sort_values("score", ascending=False)

    watchlist = []
    for uid, r in e.head(60).iterrows():
        watchlist.append(
            {
                "uid": str(uid),
                "score": float(r["score"]),
                "slips": int(r["slips"]),
                "stake": round(float(r["stake"]), 2),
                "ggr": round(float(r["ggr"]), 2),
                "customer_margin_pct": round(float(r["customer_margin"]) * 100, 1),
                "win_rate_pct": round(float(r["win_rate"]) * 100, 1),
                "avg_stake": round(float(r["avg_stake"]), 2),
                "clv_pct": None if r["clv_legs"] < UID_MIN_CLV_LEGS else round(float(r["clv"]) * 100, 2),
                "clv_legs": int(r["clv_legs"]),
                "lineup_share_pct": round(float(r["lineup_share"]) * 100, 1),
                "inplay_share_pct": round(float(r["inplay_share"]) * 100, 1),
                "top_group": str(r["top_group"]) if pd.notna(r["top_group"]) else "·",
                "top_group_share_pct": round(float(r["top_group_share"]) * 100, 1) if pd.notna(r["top_group_share"]) else 0,
                "channel": str(r["channel"]),
                "components": {
                    "clv": round(float(r["clv_pctl"]), 3),
                    "win": round(float(r["win_pctl"]), 3),
                    "lineup": round(float(r["lineup_pctl"]), 3),
                    "stake": round(float(r["stake_pctl"]), 3),
                    "focus": round(float(r["focus_pctl"]), 3),
                },
            }
        )

    # ---- anomalies (transparent rules) ----
    anomalies: list[dict] = []
    elig = sel[sel["eligible"]].copy()

    # 1. price drift: market moved sharply toward (or away from) a selection.
    # change < 0 means the price shortened (money/steam toward it); the early
    # backers beat this client's own later flow.
    elig["change"] = elig["last_price"] / elig["first_price"] - 1.0
    drifts = elig[(elig["change"].abs() >= 0.25) & (elig["stake"] >= 250)]
    for _, r in drifts.sort_values("change", key=abs, ascending=False).head(20).iterrows():
        direction = "steamed in" if r["change"] < 0 else "drifted out"
        anomalies.append(
            {
                "type": "price_drift",
                "sel_key": r["sel_key"],
                "title": f"{r['option']} ({r['market']}) · {r['match']}",
                "detail": (
                    f"struck price {direction}: {r['first_price']:.2f} -> {r['last_price']:.2f} "
                    f"({r['change']*100:+.0f}%) across {int(r['n_legs'])} bets pre-kickoff"
                ),
                "stake": round(float(r["stake"]), 2),
                "ggr": round(float(r["ggr"]), 2),
                "n_uids": int(r["n_uids"]),
                "metric": round(float(r["change"]) * 100, 1),
            }
        )

    # 2. repeated cross-customer support on one selection
    m_stake = elig.groupby("match")["stake"].transform("sum")
    elig["fixture_share"] = np.where(m_stake > 0, elig["stake"] / m_stake, 0)
    support = elig[(elig["n_uids"] >= 25) & (elig["fixture_share"] >= 0.18) & (elig["stake"] >= 500)]
    for _, r in support.sort_values("stake", ascending=False).head(20).iterrows():
        anomalies.append(
            {
                "type": "repeated_support",
                "sel_key": r["sel_key"],
                "title": f"{r['option']} ({r['market']}) · {r['match']}",
                "detail": (
                    f"{int(r['n_uids'])} distinct customers backed the same selection, "
                    f"{r['fixture_share']*100:.0f}% of the fixture's analyzable pre-KO stake"
                ),
                "stake": round(float(r["stake"]), 2),
                "ggr": round(float(r["ggr"]), 2),
                "n_uids": int(r["n_uids"]),
                "metric": round(float(r["fixture_share"]) * 100, 1),
            }
        )

    # 3. single-selection payout exposure
    for _, r in elig.sort_values("exposure", ascending=False).head(15).iterrows():
        anomalies.append(
            {
                "type": "exposure",
                "sel_key": r["sel_key"],
                "title": f"{r['option']} ({r['market']}) · {r['match']}",
                "detail": (
                    f"potential payout {r['exposure']:,.0f} EUR on {r['stake']:,.0f} EUR staked "
                    f"pre-KO ({int(r['n_legs'])} bets, prices up to {r['max_price']:.2f})"
                ),
                "stake": round(float(r["stake"]), 2),
                "ggr": round(float(r["ggr"]), 2),
                "n_uids": int(r["n_uids"]),
                "metric": round(float(r["exposure"]), 0),
            }
        )

    # 4. structurally negative pockets: market x competition cells
    df["ggr_attr"] = df.groupby("slip_id")["ggr_eur"].transform("first") / df.groupby(
        "slip_id"
    )["ggr_eur"].transform("size")
    cell = (
        df.groupby(["market_clean", "competition"])
        .agg(stake=("stake_attr", "sum"), ggr=("ggr_attr", "sum"), n_uids=("uid", "nunique"))
        .reset_index()
    )
    cell["margin"] = np.where(cell["stake"] > 0, cell["ggr"] / cell["stake"], 0)
    pockets = cell[(cell["stake"] >= 2000) & (cell["margin"] <= -0.15)]
    for _, r in pockets.sort_values("ggr").head(15).iterrows():
        anomalies.append(
            {
                "type": "negative_pocket",
                "sel_key": None,
                "title": f"{r['market_clean']} · {r['competition']}",
                "detail": (
                    f"structural leak: {r['margin']*100:.0f}% margin on {r['stake']:,.0f} EUR "
                    f"stake across {int(r['n_uids'])} customers"
                ),
                "stake": round(float(r["stake"]), 2),
                "ggr": round(float(r["ggr"]), 2),
                "n_uids": int(r["n_uids"]),
                "metric": round(float(r["margin"]) * 100, 1),
            }
        )

    # 5. turnover spikes: a day whose turnover jumps above its own trailing
    # baseline. Robust rule: trailing-7-day median + MAD on the prior days, so
    # only jumps beyond the local trend fire (the tournament onset surge is the
    # first such jump). A 10k floor keeps the sparse early days from flagging.
    daily = (
        slips.assign(day=slips["betslip_ts"].dt.floor("D"))
        .groupby("day")
        .agg(stake=("stake_eur", "sum"), ggr=("ggr_eur", "sum"), n_uids=("uid", "nunique"))
        .sort_index()
    )
    prior = daily["stake"].shift(1)
    base = prior.rolling(7, min_periods=3).median()
    mad = prior.rolling(7, min_periods=3).apply(
        lambda w: np.median(np.abs(w - np.median(w))), raw=True
    )
    sigma = 1.4826 * mad
    daily["base"] = base
    daily["z"] = (daily["stake"] - base) / sigma.replace(0, np.nan)
    spikes = daily[(daily["z"] >= 3) & (daily["stake"] >= 10_000) & base.notna()]
    df_day = df["betslip_ts"].dt.floor("D")
    for day, r in spikes.sort_values("z", ascending=False).head(10).iterrows():
        fx = df.loc[df_day == day].groupby("match")["stake_attr"].sum().sort_values(ascending=False)
        driver = str(fx.index[0]) if len(fx) else "n/a"
        driver_stake = float(fx.iloc[0]) if len(fx) else 0.0
        mult = float(r["stake"] / r["base"]) if r["base"] else 0.0
        anomalies.append(
            {
                "type": "turnover_spike",
                "sel_key": None,
                "title": f"{day.date()}: turnover spike",
                "detail": (
                    f"{r['stake']:,.0f} EUR staked, {mult:.1f}x the trailing 7-day baseline "
                    f"({r['base']:,.0f} EUR); led by {driver} ({driver_stake:,.0f} EUR)"
                ),
                "stake": round(float(r["stake"]), 2),
                "ggr": round(float(r["ggr"]), 2),
                "n_uids": int(r["n_uids"]),
                "metric": round(mult, 1),
            }
        )

    return {
        "assumptions": {
            "sel_min_legs": SEL_MIN_LEGS,
            "uid_min_slips": UID_MIN_SLIPS,
            "uid_min_stake_eur": UID_MIN_STAKE_EUR,
            "uid_min_clv_legs": UID_MIN_CLV_LEGS,
            "weights": {"clv": W_CLV, "win": W_WIN, "lineup": W_LINEUP, "stake": W_STAKE, "focus": W_FOCUS},
            "eligible_customers": int(len(e)),
            "eligible_selections": int(sel["eligible"].sum()),
        },
        "watchlist": watchlist,
        "anomalies": anomalies,
    }
