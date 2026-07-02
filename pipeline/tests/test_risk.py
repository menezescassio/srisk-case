import pandas as pd

from betflow.normalize import normalize
from betflow.phases import classify_phases
from betflow.risk import build_risk, price_proxy
from betflow.slips import build_slips
from tests.conftest import make_leg


def _prep(legs_frame, rows):
    df = normalize(legs_frame(rows))
    slips, legs = build_slips(df)
    slips = classify_phases(slips)
    return slips, legs


def test_proxy_clv_uses_last_pre_ko_price(legs_frame):
    ko = pd.Timestamp("2026-06-15 18:00:00")
    rows = [
        make_leg(uid=str(100 + i), price=p, betslip_ts=ko - pd.Timedelta(hours=h), event_ts=ko)
        for i, (p, h) in enumerate([(4.0, 30), (3.6, 20), (3.4, 10), (3.2, 5), (3.0, 1)])
    ]
    _, legs = _prep(legs_frame, rows)
    clv_legs, sel = price_proxy(legs)
    assert sel["eligible"].sum() == 1
    assert sel.iloc[0]["last_price"] == 3.0
    first = clv_legs.sort_values("betslip_ts").iloc[0]
    assert abs(first["proxy_clv"] - (4.0 / 3.0 - 1)) < 1e-9


def test_risk_payload_shape_and_thresholds(legs_frame):
    ko = pd.Timestamp("2026-06-15 18:00:00")
    rows = []
    # one busy customer with 20 slips, big stakes, late timing
    for i in range(20):
        rows.append(
            make_leg(
                uid="7777",
                stake=50.0,
                ggr=-20.0,
                price=3.0 + (i % 4) * 0.2,
                betslip_ts=ko - pd.Timedelta(minutes=30 + i),
                event_ts=ko,
            )
        )
    # background customers below eligibility
    for i in range(10):
        rows.append(make_leg(uid=str(9000 + i), stake=1.0, betslip_ts=ko - pd.Timedelta(hours=5), event_ts=ko))
    slips, legs = _prep(legs_frame, rows)
    risk = build_risk(slips, legs)
    assert risk["assumptions"]["eligible_customers"] == 1
    assert risk["watchlist"][0]["uid"] == "7777"
    assert 0 <= risk["watchlist"][0]["score"] <= 100
    comp = risk["watchlist"][0]["components"]
    assert set(comp) == {"clv", "win", "lineup", "stake", "focus"}
