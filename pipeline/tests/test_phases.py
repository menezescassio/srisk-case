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
            slip(76),    # day-of
            slip(75),    # boundary -> post-lineups
            slip(1),     # post-lineups
            slip(-1),    # in-play
            slip(-130),  # still in-play window
            slip(-131),  # match should be over -> suspect
            slip(None),  # missing kickoff -> suspect
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
        "suspect timing",
        "suspect timing",
    ]
