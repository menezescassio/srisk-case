import pandas as pd

from betflow.normalize import normalize
from betflow.slips import build_slips, duplicate_ambiguity
from tests.conftest import make_leg


def prepared(legs_frame, rows):
    df = legs_frame(rows)
    return normalize(df)


def test_combined_legs_roll_up_to_one_slip(legs_frame):
    ts = pd.Timestamp("2026-06-15 12:00:00")
    rows = [
        make_leg(bet_type="COMBINED", option_raw="Leg 1", price=1.5, stake=25.0, ggr=25.0, betslip_ts=ts),
        make_leg(bet_type="COMBINED", option_raw="Leg 2", price=1.2, stake=25.0, ggr=25.0, betslip_ts=ts),
        make_leg(bet_type="COMBINED", option_raw="Leg 3", price=1.35, stake=25.0, ggr=25.0, betslip_ts=ts),
    ]
    slips, legs = build_slips(prepared(legs_frame, rows))
    assert len(slips) == 1
    slip = slips.iloc[0]
    assert slip["stake_eur"] == 25.0  # stake counted once, not per leg
    assert slip["ggr_eur"] == 25.0
    assert slip["n_legs"] == 3
    assert abs(slip["price"] - 1.5 * 1.2 * 1.35) < 1e-9
    assert set(legs["slip_id"]) == {slips["slip_id"].iloc[0]}


def test_same_second_slips_with_different_settlement_stay_separate(legs_frame):
    ts = pd.Timestamp("2026-06-15 12:00:00")
    rows = [
        make_leg(bet_type="COMBINED", option_raw="Leg X", stake=0.03, ggr=0.03, betslip_ts=ts),
        make_leg(bet_type="COMBINED", option_raw="Leg X", stake=0.03, ggr=-3.73, betslip_ts=ts),
    ]
    slips, _ = build_slips(prepared(legs_frame, rows))
    assert len(slips) == 2  # distinct GGR separates the slip proxies


def test_simple_rows_never_collapse(legs_frame):
    rows = [make_leg(), make_leg()]  # identical SIMPLE rows
    slips, _ = build_slips(prepared(legs_frame, rows))
    assert len(slips) == 2
    assert slips["stake_eur"].sum() == 20.0


def test_duplicate_ambiguity_quantified(legs_frame):
    rows = [make_leg(), make_leg(), make_leg(uid="99")]
    _, legs = build_slips(prepared(legs_frame, rows))
    stats = duplicate_ambiguity(legs)
    assert stats["exact_dup_rows"] == 2
    assert stats["exact_dup_rows_simple"] == 2
    assert stats["exact_dup_stake_eur"] == 20.0
