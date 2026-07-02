import pandas as pd
import pytest

from betflow.normalize import classify_market, extract_line, normalize
from tests.conftest import make_leg


@pytest.mark.parametrize(
    "raw,clean,group",
    [
        ("{COMPETITOR1}", "Team BetBuilder (home)", "BetBuilder"),
        ("{COMPETITOR2}", "Team BetBuilder (away)", "BetBuilder"),
        ("Match", "Match BetBuilder", "BetBuilder"),
        ("1-X-2 / 2 goals Up", "1X2 (2-goal cushion)", "Enhanced 1X2"),
        ("Anytime goalscorer (Star Substitute)", "Anytime goalscorer [Star Sub]", "Goalscorer props"),
        ("{goalnr}{ordinal} goal scorer", "Nth goal scorer", "Goalscorer props"),
        ("Shots on target {PLAYER} (Star Substitute)", "Shots on target (player) [Star Sub]", "Player props"),
        ("Player most passes (voiding in case of tie)", "Player most passes (voiding in case of tie)", "Player props"),
        ("Team corners", "Team corners", "Team stats"),
        ("Match corners", "Match corners", "Match stats"),
        ("Most Saves - {PLAYER1} vs {PLAYER2} (both starters)", "Player duel: Most Saves", "Player props"),
    ],
)
def test_market_classification(raw, clean, group):
    got_clean, got_group = classify_market(raw)
    assert got_clean == clean
    assert got_group == group


def test_extract_line():
    assert extract_line("Alpha 5 or more") == 5.0
    assert extract_line("Over 2.5 goals y Over 7.5 corners") == 2.5
    assert extract_line("Test Player") is None


def test_currency_inference_and_conversion(legs_frame):
    rows = [
        make_leg(currency_raw=None, unit="UNIT PERÚ RETAIL", stake=39.0),
        make_leg(currency_raw=None, unit="UNIT NORTH", stake=10.0),
        make_leg(currency_raw="PEN", unit="UNIT PERÚ RETAIL", stake=39.0),
    ]
    df = normalize(legs_frame(rows))
    assert df["currency"].tolist() == ["PEN", "EUR", "PEN"]
    assert df["currency_inferred"].tolist() == [True, True, False]
    assert df["stake_eur"].iloc[0] == pytest.approx(10.0)  # 39 PEN at 3.90
    assert df["stake_eur"].iloc[1] == 10.0


def test_channel_from_uid(legs_frame):
    rows = [
        make_leg(uid="12345"),
        make_leg(uid="MAH-01-51282"),
        make_leg(uid="TPV-9"),
    ]
    df = normalize(legs_frame(rows))
    assert df["channel"].tolist() == ["online", "retail", "tpv"]


def test_entity_extraction(legs_frame):
    rows = [
        make_leg(market_raw="{COMPETITOR1}", match="Alpha - Beta", option_raw="Alpha win y X to score"),
        make_leg(market_raw="Team corners", match="Alpha - Beta", option_raw="Beta 5 or more"),
        make_leg(market_raw="Anytime goalscorer (Star Substitute)", option_raw="Test Player"),
        make_leg(market_raw="Shots on target {PLAYER} (Star Substitute)", option_raw="2 or more"),
    ]
    df = normalize(legs_frame(rows))
    assert df["entity_team"].iloc[0] == "Alpha"
    assert df["entity_team"].iloc[1] == "Beta"
    assert df["entity_player"].iloc[2] == "Test Player"
    assert pd.isna(df["entity_player"].iloc[3])  # a line, not a name
