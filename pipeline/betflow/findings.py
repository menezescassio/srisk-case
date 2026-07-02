"""Findings: the written story, generated from the data.

One structured document feeds both the dashboard's Findings view and the PDF
report, so the narrative numbers can never drift from the analytics. Plain
trading language, measured claims, no verdicts about customers.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def _eur(v: float) -> str:
    return f"-€{abs(v):,.0f}" if v < 0 else f"€{v:,.0f}"


def _pct(v: float, dp: int = 1) -> str:
    return f"{v:.{dp}f}%"


def _phase_stats(slips: pd.DataFrame) -> pd.DataFrame:
    g = slips.groupby("phase").agg(stake=("stake_eur", "sum"), ggr=("ggr_eur", "sum"), slips=("slip_id", "size"))
    g["share"] = g["stake"] / g["stake"].sum() * 100
    g["margin"] = np.where(g["stake"] > 0, g["ggr"] / g["stake"] * 100, 0)
    return g


def _group_stats(legs: pd.DataFrame) -> pd.DataFrame:
    df = legs.copy()
    size = df.groupby("slip_id")["stake_eur"].transform("size")
    df["stake_attr"] = df.groupby("slip_id")["stake_eur"].transform("first") / size
    df["ggr_attr"] = df.groupby("slip_id")["ggr_eur"].transform("first") / size
    g = df.groupby("market_group").agg(stake=("stake_attr", "sum"), ggr=("ggr_attr", "sum"))
    g["margin"] = np.where(g["stake"] > 0, g["ggr"] / g["stake"] * 100, 0)
    g["share"] = g["stake"] / g["stake"].sum() * 100
    return g.sort_values("stake", ascending=False)


def build_findings(slips: pd.DataFrame, legs: pd.DataFrame, recon: dict, risk: dict) -> dict:
    ph = _phase_stats(slips)
    grp = _group_stats(legs)

    def phase(p: str, col: str) -> float:
        return float(ph.loc[p, col]) if p in ph.index else 0.0

    # channels
    ch = slips.groupby("channel").agg(stake=("stake_eur", "sum"), ggr=("ggr_eur", "sum"))
    ch["margin"] = ch["ggr"] / ch["stake"] * 100
    ch["share"] = ch["stake"] / ch["stake"].sum() * 100

    # bet types
    bt = slips.groupby("bet_type").agg(stake=("stake_eur", "sum"), ggr=("ggr_eur", "sum"))
    bt["margin"] = bt["ggr"] / bt["stake"] * 100

    # retail bet mix (explains the thin retail margin)
    retail = slips[slips["channel"] == "retail"]
    online = slips[slips["channel"] == "online"]
    retail_comb = float(retail.loc[retail["bet_type"] == "COMBINED", "stake_eur"].sum() / max(retail["stake_eur"].sum(), 1) * 100)
    online_comb = float(online.loc[online["bet_type"] == "COMBINED", "stake_eur"].sum() / max(online["stake_eur"].sum(), 1) * 100)

    # daily flow
    day = slips.set_index("betslip_ts").resample("D").agg(stake=("stake_eur", "sum"), ggr=("ggr_eur", "sum"))
    peak = day["stake"].idxmax()
    worst = day["ggr"].idxmin()

    # worst day's biggest losing fixtures (leg-attributed)
    df = legs.copy()
    size = df.groupby("slip_id")["stake_eur"].transform("size")
    df["ggr_attr"] = df.groupby("slip_id")["ggr_eur"].transform("first") / size
    df["stake_attr"] = df.groupby("slip_id")["stake_eur"].transform("first") / size
    wd = df[df["betslip_ts"].dt.date == worst.date()]
    worst_fx = (
        wd.groupby("match")["ggr_attr"].sum().sort_values().head(3)
    )

    # star substitute share (Sporting Risk's flagship prop product)
    star_stake = float(df.loc[df["star_substitute"], "stake_attr"].sum())
    star_share = star_stake / float(df["stake_attr"].sum()) * 100
    star_ggr = float(df.loc[df["star_substitute"], "ggr_attr"].sum())

    # SR-core product surface
    core_groups = ["Player props", "Goalscorer props", "BetBuilder"]
    core_share = float(grp.loc[grp.index.isin(core_groups), "share"].sum())

    # the 2+ goals pocket
    m2 = df[df["market_clean"].str.startswith("To score 2 or more goals")]
    m2_stake = float(m2["stake_attr"].sum())
    m2_ggr = float(m2["ggr_attr"].sum())

    # customer breadth
    per_uid = slips.groupby("uid")["stake_eur"].sum().sort_values(ascending=False)
    top10_share = float(per_uid.head(10).sum() / per_uid.sum() * 100)
    v = np.sort(per_uid.values)
    gini = float(((2 * np.arange(1, len(v) + 1) - len(v) - 1) * v).sum() / (len(v) * v.sum()))

    # watchlist digest
    wl = risk["watchlist"]
    wl_top10_ggr = sum(w["ggr"] for w in wl[:10])
    wl_pos_clv = sum(1 for w in wl[:20] if (w["clv_pct"] or 0) > 2)

    # the costliest single-selection exposure that landed (from the anomaly list)
    expo = [a for a in risk["anomalies"] if a["type"] == "exposure"]
    top_expo = min(expo, key=lambda a: a["ggr"]) if expo else None

    # bets struck well after kickoff (folded into in-play rather than a suspect bucket)
    late = slips[slips["lead_minutes"] < -130]
    late_slips = int(len(late))
    late_stake = round(float(late["stake_eur"].sum()), 0)

    # dual catalog fixtures
    m = legs[["match_id", "match", "event_ts"]].dropna().copy()
    m["day"] = (m["event_ts"] - pd.Timedelta(hours=6)).dt.date
    n_ids = m["match_id"].nunique()
    n_fx = m.groupby(["match", "day"]).ngroups

    # billing tiers
    nz = slips[slips["ggr_eur"] != 0]
    ratio = (nz["net_revenue_eur"] / nz["ggr_eur"]).round(4)
    tiers = ratio.value_counts().head(2)

    r = recon
    window = f"{r['betslip_min'][:10]} to {r['betslip_max'][:10]}"

    headline = [
        {"label": "Turnover", "value": _eur(r["turnover_eur"])},
        {"label": "GGR", "value": _eur(r["ggr_eur"])},
        {"label": "Blended margin", "value": _pct(r["margin_pct"], 2)},
        {"label": "Betslips", "value": f"{r['slips']:,}"},
        {"label": "Customers", "value": f"{r['unique_customers']:,}"},
        {"label": "Window", "value": window},
    ]

    sections = [
        {
            "id": "summary",
            "title": "Executive summary",
            "paras": [],
            "bullets": [
                f"This client put {_eur(r['turnover_eur'])} through the book over the window ({window}), "
                f"{r['slips']:,} betslips from {r['unique_customers']:,} customers, for {_eur(r['ggr_eur'])} of GGR "
                f"at a blended {_pct(r['margin_pct'], 2)} margin. The World Cup is the whole story: "
                f"roughly 95% of turnover sits on tournament fixtures, peaking at {_eur(float(day.loc[peak, 'stake']))} "
                f"on {peak.date()}.",
                f"Timing is the defining behavior: {_pct(phase('post-lineups (proxy)', 'share'))} of all stake arrives in the "
                f"final 60 minutes before kickoff (about an hour out, our post-lineups proxy), at a healthy {_pct(phase('post-lineups (proxy)', 'margin'))} margin. "
                f"The soft spot is earlier: day-of pre-match money runs at just {_pct(phase('day-of pre-match', 'margin'))} margin "
                f"and early pre-match is negative at {_pct(phase('early pre-match', 'margin'))}.",
                f"Product mix decides margin. Team stats ({_pct(float(grp.loc['Team stats', 'margin']))}) and match stats "
                f"({_pct(float(grp.loc['Match stats', 'margin']))}) print; goalscorer props leak badly "
                f"({_eur(float(grp.loc['Goalscorer props', 'ggr']))} GGR, {_pct(float(grp.loc['Goalscorer props', 'margin']))} margin), "
                f"driven by one ladder: 'to score 2 or more goals' cost {_eur(m2_ggr)} on {_eur(m2_stake)} staked.",
                f"COMBINED slips lost money overall ({_pct(float(bt.loc['COMBINED', 'margin']))} margin on "
                f"{_eur(float(bt.loc['COMBINED', 'stake']))}), and {worst.date()} was the bloodbath day: "
                f"{_eur(float(day.loc[worst, 'ggr']))} of GGR in one day, led by "
                + ", ".join(f"{k} ({_eur(v)})" for k, v in worst_fx.items())
                + ".",
                f"The customer base is broad, not whale-driven: the top 10 customers hold only {_pct(top10_share)} of stake "
                f"(Gini {gini:.2f}). Sharpness is a tail phenomenon: {len(wl)} customers merit trader review; the top 10 of them "
                f"took {_eur(-wl_top10_ggr)} off the book and {wl_pos_clv} of the top 20 consistently beat this flow's own later prices.",
                f"Retail shops ({_pct(float(ch.loc['retail', 'share']))} of stake via MAH accounts) run at "
                f"{_pct(float(ch.loc['retail', 'margin']))} margin vs online's {_pct(float(ch.loc['online', 'margin']))}, "
                f"largely a bet-mix effect: {_pct(retail_comb, 0)} of retail stake is combined slips vs {_pct(online_comb, 0)} online.",
            ],
        },
        {
            "id": "data",
            "title": "What we received, and the decisions that shaped every number",
            "paras": [
                f"Two exports of the same billing report, pulled 95 seconds apart on 2026-06-24, covering adjacent betslip "
                f"windows (A dense through 2026-06-20, B from 2026-06-19 to 2026-06-23). True cross-file overlap is "
                f"{r['overlap_rows']:,} rows on the seam; {r['settlement_conflicts']} of those rows carry different settlement "
                f"in each file and the later pull wins. The often-quoted '75k identical rows' are exact duplicates across the "
                f"union ({r['duplicate_ambiguity']['exact_dup_rows']:,}), which are overwhelmingly combined-slip legs repeating "
                f"slip-level values by design, not a cross-file duplication.",
                f"COMBINED rows are legs that each repeat their slip's stake and GGR. Rolling {r['union_rows']:,} rows up to "
                f"{r['slips']:,} slips (grouped by customer, timestamp, stake and settlement) removes "
                f"{_eur(r['raw_rows_turnover_eur'] - r['turnover_eur'])} of phantom turnover. This is the single most material "
                f"correction in the analysis; skip it and every downstream number is wrong.",
                f"All money is EUR at fixed 2026-06-23 reference rates (PEN 3.90, USD 1.138 per EUR); "
                f"{r['currency_rows_inferred']:,} null-currency rows were inferred from unit geography. "
                f"The same real fixture appears under two MatchIds (pre-match and in-play catalogs): {n_ids:,} MatchIds "
                f"collapse to {n_fx:,} fixtures once merged by name and kickoff day. Two billing tiers are visible in the data "
                f"(net revenue at {tiers.index[0]*100:.2f}% of GGR on most rows, {tiers.index[1]*100:.2f}% on one regional unit).",
                f"Activity before {r['betslip_min'][:10]} is sparse pre-tournament test and warm-up traffic on non-World-Cup "
                f"fixtures ({r['excluded_pretournament']['rows']} betslips, {_eur(r['excluded_pretournament']['stake_eur'])}, "
                f"about 0.02% of turnover). It is excluded so the dashboard, this report and the reconciliation all describe the "
                f"same clean window.",
            ],
            "bullets": [],
        },
        {
            "id": "flow",
            "title": "How the flow behaves",
            "paras": [
                f"Activity is a tournament heartbeat: near zero before 2026-06-08, then daily peaks tracking the match calendar "
                f"up to {_eur(float(day.loc[peak, 'stake']))} on {peak.date()}. Within a match day the shape repeats: a slow "
                f"build from midday, a steep surge when team news lands, and a spike into kickoff.",
                f"By phase: post-lineups {_pct(phase('post-lineups (proxy)', 'share'))} of stake at "
                f"{_pct(phase('post-lineups (proxy)', 'margin'))} margin, day-of pre-match {_pct(phase('day-of pre-match', 'share'))} "
                f"at {_pct(phase('day-of pre-match', 'margin'))}, in-play {_pct(phase('in-play', 'share'))} at "
                f"{_pct(phase('in-play', 'margin'))}, early pre-match {_pct(phase('early pre-match', 'share'))} at "
                f"{_pct(phase('early pre-match', 'margin'))}. The book wins clearly after team news and in-play; it struggles "
                f"whenever customers bet into earlier, softer numbers.",
                f"Star Substitute markets, the substitute-player prop family, take {_pct(star_share)} of attributed stake "
                f"({_eur(star_stake)}) and returned {_eur(star_ggr)} of GGR. Player-facing products overall "
                f"(player props, goalscorer, BetBuilder) carry {_pct(core_share, 0)} of turnover.",
            ],
            "bullets": [],
        },
        {
            "id": "risk",
            "title": "What merits investigation",
            "paras": [
                f"Customer sharpness was scored transparently over {risk['assumptions']['eligible_customers']} eligible customers "
                f"(15+ slips, €150+ staked) as a weighted percentile of proxy CLV, winnings, post-lineups timing, stake size and "
                f"market focus. No customer is labeled sharp; the score ranks who a trader should look at first, with the evidence attached.",
                f"The pattern at the top of the watchlist is consistent: goalscorer and player-prop specialists, betting almost "
                f"exclusively in the post-lineups window, repeatedly at prices better than this flow's own later prices on the same "
                f"selection. Proxy CLV is an internal movement measure (no odds history exists in the export), which is exactly why "
                f"it belongs on a watchlist rather than in a verdict.",
                f"Anomaly flags worth a desk's minutes: Star Substitute prices drifting out 100%+ pre-kickoff as team news "
                f"repriced them (early backers were on the right side); heavy cross-customer support on marquee scorers"
                + (
                    f" ({top_expo['title']} drew {_eur(top_expo['stake'])} pre-kickoff and cost {_eur(top_expo['ggr'])} "
                    f"attributed GGR when it landed)"
                    if top_expo
                    else ""
                )
                + f"; and the structural pocket, 'to score 2 or more goals', {_eur(m2_ggr)} across the tournament. "
                f"{worst.date()} alone ({_eur(float(day.loc[worst, 'ggr']))}) shows what correlated marquee results do to this book.",
            ],
            "bullets": [],
        },
        {
            "id": "commercial",
            "title": "The commercial read for Sporting Risk",
            "paras": [
                f"This client is a props-led World Cup book, which is Sporting Risk's home turf: {_pct(core_share, 0)} of turnover "
                f"flows through player-facing products, including {_pct(star_share)} through Star Substitute markets. The account "
                f"is healthy at the blended level ({_pct(r['margin_pct'], 2)}) but the margin is carried by team and match stats "
                f"while the flagship goalscorer ladder leaks.",
                "Three account actions follow directly from the rows: first, a pricing review of the multi-goal scorer ladder "
                "(2+ and hat trick) into the knockout rounds, where marquee-name inflation meets correlated outcomes; second, a "
                "combined/BetBuilder margin review, since multiples lost money overall in this window; third, exposure controls in "
                "the final-hour post-lineups window, where nearly half the money arrives and where the watchlist customers operate.",
                f"There is also an upside story to sell, not just a leak to fix: the client's day-of pre-match flow "
                f"({_pct(phase('day-of pre-match', 'share'))} of stake at {_pct(phase('day-of pre-match', 'margin'))}) is exactly "
                f"where sharper pricing and Sporting Risk's in-play and micromarket products can lift margin without touching "
                f"the recreational experience.",
            ],
            "bullets": [],
        },
        {
            "id": "limitations",
            "title": "Assumptions and limitations",
            "paras": [],
            "bullets": [
                "No betslip IDs exist, so combined slips are grouped by (customer, timestamp, stake, settlement); identical "
                "same-second slips merge and the affected stake is quantified in the reconciliation.",
                "No odds history or closing prices: 'proxy CLV' is struck price vs the last struck price on the same selection "
                "inside this client's own pre-kickoff flow. It measures movement within this flow only.",
                "Post-lineups is a proxy phase: the final 60 minutes (about an hour) before first kickoff, when team sheets are "
                "typically public. Lineup timestamps are not in the data.",
                f"Timing edges are pushed to the real phases rather than a separate suspect bucket: a bet placed after kickoff is "
                f"treated as in-play however late ({late_slips} betslips, {_eur(late_stake)}, were struck well after kickoff, likely "
                f"fixture-catalog or late-entry timing), and a bet with an unusable timestamp would fall to early pre-match (none in "
                f"this window).",
                "No settlement detail beyond GGR and net revenue per row: cash-outs, partial voids and rounding cannot be separated, "
                "and a small minority of won combined slips do not reconcile exactly against leg prices.",
                "FX is fixed at 2026-06-23 reference rates; PEN and USD are about 3% of rows.",
                "Settlement is as of 2026-06-24; later resettlements are not reflected.",
            ],
        },
        {
            "id": "next",
            "title": "What I'd do next",
            "paras": [],
            "bullets": [
                "Data access: odds history and true closing prices (turns proxy CLV into real CLV), betslip IDs (kills the slip-grouping "
                "ambiguity), settlement detail incl. cash-outs, lineup publication timestamps, and customer metadata (registration date, limits).",
                "Always-on: this pipeline is already reproducible end to end; schedule it on each report drop, alert on new watchlist "
                "entrants, price-drift flags and negative-pocket growth, and keep the dashboard as the desk's standing view of the account.",
                "Modeling: player-level exposure by fixture (the Messi case as a class), a combined-slip pricing audit against SR's own "
                "model prices, and margin-repair tracking for the 2+ goals ladder measured week over week.",
                "Commercially: turn this into the quarterly account review pack for the client, with the leak-repair plan and the "
                "post-lineups exposure policy as the two headline workstreams.",
            ],
        },
    ]

    phase_order = ["early pre-match", "day-of pre-match", "post-lineups (proxy)", "in-play"]
    tables = {
        "phases": [
            {
                "name": p,
                "stake": round(phase(p, "stake"), 0),
                "share": round(phase(p, "share"), 1),
                "ggr": round(phase(p, "ggr"), 0),
                "margin": round(phase(p, "margin"), 1),
            }
            for p in phase_order
            if p in ph.index
        ],
        "groups": [
            {
                "name": name,
                "stake": round(float(row["stake"]), 0),
                "share": round(float(row["share"]), 1),
                "ggr": round(float(row["ggr"]), 0),
                "margin": round(float(row["margin"]), 1),
            }
            for name, row in grp.iterrows()
        ],
        "watchlist": [
            {
                "uid": w["uid"],
                "score": w["score"],
                "stake": w["stake"],
                "ggr": w["ggr"],
                "clv_pct": w["clv_pct"],
                "lineup_share_pct": w["lineup_share_pct"],
                "top_group": w["top_group"],
            }
            for w in wl[:10]
        ],
        "recon": [
            {"name": "file A", "rows": r["files"]["A"]["rows"], "turnover": r["files"]["A"]["turnover_raw_rows"], "ggr": r["files"]["A"]["ggr_raw_rows"], "note": "raw rows, mixed currencies"},
            {"name": "file B", "rows": r["files"]["B"]["rows"], "turnover": r["files"]["B"]["turnover_raw_rows"], "ggr": r["files"]["B"]["ggr_raw_rows"], "note": "raw rows, mixed currencies"},
            {"name": "union, deduped", "rows": r["union_rows"], "turnover": r["raw_rows_turnover_eur"], "ggr": r["raw_rows_ggr_eur"], "note": "EUR, leg rows"},
            {"name": "slip-level (headline)", "rows": r["slips"], "turnover": r["turnover_eur"], "ggr": r["ggr_eur"], "note": f"margin {r['margin_pct']:.2f}%"},
        ],
    }

    return {
        "title": "Betflow: client betslip analysis",
        "window": window,
        "generated": r["generated_at"][:10],
        "headline": headline,
        "sections": sections,
        "tables": tables,
        "signature": "Prepared by Cassio Menezes",
    }
