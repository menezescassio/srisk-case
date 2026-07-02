"""Field normalization: market taxonomy, entities, currency, channel.

The export mixes rendered and unrendered market templates, Spanish
descriptors in the Player column, and selection strings in the Option
column whose meaning depends on the market. This module turns that into:

- market_clean: readable market name (templates rendered generically)
- market_group: small taxonomy for aggregation
- entity_player / entity_team: best-effort entity extraction
- selection: what was actually backed (player name, line, builder text)
- stake_eur / ggr_eur / net_revenue_eur: EUR-normalized financials
- channel: online (numeric uid) / retail (MAH-) / tpv (TPV-)
"""

from __future__ import annotations

import re

import pandas as pd

from .config import FX_TO_EUR


def is_peru_unit(unit: str | None) -> bool:
    """Peru units are currency-inferred to PEN. Matched by substring so no
    client-identifying unit names live in committed code."""
    if not isinstance(unit, str):
        return False
    return "PERU" in unit.upper().replace("Ú", "U")

# ---------------------------------------------------------------- markets

GROUP_BETBUILDER = "BetBuilder"
GROUP_GOALSCORER = "Goalscorer props"
GROUP_PLAYER = "Player props"
GROUP_TEAM = "Team stats"
GROUP_MATCH = "Match stats"
GROUP_1X2 = "Enhanced 1X2"
GROUP_OTHER = "Other"

_STAR_RE = re.compile(r"\s*\(Star Substitute\)\s*", re.IGNORECASE)

# exact-template renames (before rule matching)
_EXACT = {
    "{COMPETITOR1}": ("Team BetBuilder (home)", GROUP_BETBUILDER),
    "{COMPETITOR2}": ("Team BetBuilder (away)", GROUP_BETBUILDER),
    "Match": ("Match BetBuilder", GROUP_BETBUILDER),
    "1-X-2 / 2 goals Up": ("1X2 (2-goal cushion)", GROUP_1X2),
    "{goalnr}{ordinal} goal scorer": ("Nth goal scorer", GROUP_GOALSCORER),
    "{CARDNR}st player to be booked": ("Nth player booked", GROUP_PLAYER),
    "Goles durante el partido": ("Match goals", GROUP_MATCH),
}

_GOALSCORER_HINTS = (
    "goalscorer",
    "goal scorer",
    "to score",
    "hat trick",
    "score a header",
    "score from outside",
    "score or assist",
    "score and assist",
    "first to score",
    "anytime not to score",
)

_PLAYER_HINTS = (
    "{player}",
    "player ",
    "most passes",
    "most fouls",
    "most tackles",
    "to be carded",
    "to be booked",
    "sent off",
    "to miss a penalty",
    "first foul",
    "first to be fouled",
)


def classify_market(market_raw: str) -> tuple[str, str]:
    """Return (market_clean, market_group) for a raw market label."""
    if market_raw in _EXACT:
        return _EXACT[market_raw]
    star = bool(_STAR_RE.search(market_raw))
    base = _STAR_RE.sub("", market_raw).strip()
    low = base.lower()

    if "{player1} vs {player2}" in low:
        stat = base.split("-")[0].strip()
        clean = f"Player duel: {stat}"
        group = GROUP_PLAYER
    elif "{player}" in low:
        clean = base.replace("{PLAYER}", "(player)").strip()
        group = GROUP_PLAYER
    elif any(h in low for h in _GOALSCORER_HINTS):
        clean = base
        group = GROUP_GOALSCORER
    elif any(h in low for h in _PLAYER_HINTS):
        clean = base
        group = GROUP_PLAYER
    elif low.startswith(("team", "1st half: team", "2nd half: team")) or " team" in low:
        clean = base
        group = GROUP_TEAM
    elif low.startswith(("match", "1st half", "2nd half", "corners")):
        clean = base
        group = GROUP_MATCH
    else:
        clean = base
        group = GROUP_OTHER
    if star:
        clean = f"{clean} [Star Sub]"
    return clean, group


# Markets where Option holds the backed player's name.
_OPTION_IS_PLAYER_GROUPS = {GROUP_GOALSCORER}
_OPTION_IS_PLAYER_HINTS = ("most passes", "most fouls", "most tackles", "player to", "to be carded", "to be booked", "sent off", "nth player booked")

_LINE_RE = re.compile(r"(\d+(?:\.\d+)?)\s*or more|over\s*(\d+(?:\.\d+)?)|under\s*(\d+(?:\.\d+)?)", re.IGNORECASE)


def extract_line(option_raw: str) -> float | None:
    m = _LINE_RE.search(option_raw or "")
    if not m:
        return None
    for g in m.groups():
        if g is not None:
            return float(g)
    return None


def _teams_from_match(match: str) -> tuple[str, str]:
    if isinstance(match, str) and " - " in match:
        home, _, away = match.partition(" - ")
        return home.strip(), away.strip()
    return "", ""


def add_market_columns(df: pd.DataFrame) -> pd.DataFrame:
    mapping = {m: classify_market(m) for m in df["market_raw"].dropna().unique()}
    df["market_clean"] = df["market_raw"].map(lambda m: mapping.get(m, (m, GROUP_OTHER))[0])
    df["market_group"] = df["market_raw"].map(lambda m: mapping.get(m, (m, GROUP_OTHER))[1])
    df["star_substitute"] = df["market_raw"].str.contains("Star Substitute", case=False, na=False)

    homes, aways = zip(*df["match"].map(_teams_from_match))
    df["team_home"] = pd.Series(homes, index=df.index, dtype="string")
    df["team_away"] = pd.Series(aways, index=df.index, dtype="string")

    # entity_team: for team BetBuilder use match side; for Team-stat markets
    # match the option prefix against the two team names.
    df["entity_team"] = pd.NA
    df.loc[df["market_raw"] == "{COMPETITOR1}", "entity_team"] = df["team_home"]
    df.loc[df["market_raw"] == "{COMPETITOR2}", "entity_team"] = df["team_away"]
    team_mask = df["market_group"] == GROUP_TEAM
    sub = df.loc[team_mask]

    def _team_from_option(option: str | None, home: str, away: str) -> str | None:
        if isinstance(option, str):
            if home and option.startswith(home):
                return home
            if away and option.startswith(away):
                return away
        return None

    df.loc[team_mask, "entity_team"] = [
        _team_from_option(o, h, w)
        for o, h, w in zip(sub["option_raw"], sub["team_home"].fillna(""), sub["team_away"].fillna(""))
    ]
    df["entity_team"] = df["entity_team"].astype("string")

    # entity_player: markets where the option is the player name, plus
    # {PLAYER}-template markets where the Spanish descriptor wraps the name.
    df["entity_player"] = pd.NA
    grp = df["market_group"]
    clean_low = df["market_clean"].str.lower()
    option_is_player = grp.isin(_OPTION_IS_PLAYER_GROUPS) | clean_low.str.contains(
        "|".join(re.escape(h) for h in _OPTION_IS_PLAYER_HINTS), na=False
    )
    # lines like "2 or more" are not names
    looks_like_line = df["option_raw"].str.match(r"^\d|^Over|^Under", na=False)
    df.loc[option_is_player & ~looks_like_line, "entity_player"] = df["option_raw"]
    df["entity_player"] = df["entity_player"].astype("string")

    df["line"] = df["option_raw"].map(extract_line)
    df["selection"] = df["option_raw"]
    return df


# ---------------------------------------------------------------- currency / channel

def add_currency_columns(df: pd.DataFrame) -> pd.DataFrame:
    inferred = df["currency_raw"].isna()
    fallback = df["unit"].map(lambda u: "PEN" if is_peru_unit(u) else "EUR")
    df["currency"] = df["currency_raw"].fillna(fallback)
    df["currency_inferred"] = inferred
    rate = df["currency"].map(FX_TO_EUR)
    if rate.isna().any():
        unknown = sorted(df.loc[rate.isna(), "currency"].unique())
        raise ValueError(f"no FX rate for currencies: {unknown}")
    for col in ["stake", "ggr", "net_revenue"]:
        df[f"{col}_eur"] = df[col] * rate
    return df


def add_channel_columns(df: pd.DataFrame) -> pd.DataFrame:
    uid = df["uid"].astype("string")
    df["channel"] = "online"
    df.loc[uid.str.startswith("MAH-", na=False), "channel"] = "retail"
    df.loc[uid.str.startswith("TPV", na=False), "channel"] = "tpv"
    df["unit_country"] = "Spain"
    df.loc[df["unit"].map(is_peru_unit), "unit_country"] = "Peru"
    df.loc[df["unit"].str.contains("PORTUGAL", na=False), "unit_country"] = "Portugal"
    return df


def normalize(df: pd.DataFrame) -> pd.DataFrame:
    df = add_market_columns(df)
    df = add_currency_columns(df)
    df = add_channel_columns(df)
    return df
