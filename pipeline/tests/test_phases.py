import pandas as pd

from betflow.phases import classify_phases


def slip(lead_minutes: float | None):
    kickoff = pd.Timestamp("2026-06-15 18:00:00")
    return {
        "first_event_ts": kickoff if lead_minutes is not None else pd.NaT,
        "betslip_ts": kickoff - pd.Timedelta(minutes=lead_minutes or 0),
    }


def test_phase_boundaries():
    df = pd.DataFrame(
        [
            slip(3000),  # > 24h early
            slip(1440),  # exactly 24h -> day-of
            slip(61),    # just over 1h -> day-of
            slip(60),    # 1h boundary -> post-lineups
            slip(1),     # post-lineups
            slip(-1),    # in-play
            slip(-200),  # struck well after kickoff -> still in-play (no suspect bucket)
            slip(None),  # missing kickoff -> falls through to early pre-match
        ]
    )
    out = classify_phases(df)
    assert out["phase"].tolist() == [
        "early pre-match",
        "day-of pre-match",
        "day-of pre-match",
        "post-lineups (proxy)",
        "post-lineups (proxy)",
        "in-play",
        "in-play",
        "early pre-match",
    ]
