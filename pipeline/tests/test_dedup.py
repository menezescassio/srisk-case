import pandas as pd

from betflow.dedup import dedupe
from tests.conftest import make_leg


def frame(rows):
    df = pd.DataFrame(rows)
    return df


def test_union_keeps_file_only_rows(legs_frame):
    a = legs_frame([make_leg(uid="1"), make_leg(uid="2")])
    b = legs_frame([make_leg(uid="3")])
    union, recon = dedupe(a, b)
    assert len(union) == 3
    assert recon.overlap_rows == 0


def test_overlap_counts_once(legs_frame):
    a = legs_frame([make_leg(uid="1")])
    b = legs_frame([make_leg(uid="1")])
    union, recon = dedupe(a, b)
    assert len(union) == 1
    assert recon.overlap_rows == 1


def test_occurrence_index_preserves_infile_duplicates(legs_frame):
    # two identical rows in A, one in B: the pair survives as a pair
    a = legs_frame([make_leg(uid="1"), make_leg(uid="1")])
    b = legs_frame([make_leg(uid="1")])
    union, recon = dedupe(a, b)
    assert len(union) == 2
    assert recon.overlap_rows == 1


def test_later_pull_wins_settlement(legs_frame):
    a = legs_frame([make_leg(uid="1", ggr=10.0, net_revenue=0.8)])
    b = legs_frame([make_leg(uid="1", ggr=-35.0, net_revenue=-2.8)])
    union, recon = dedupe(a, b)
    assert len(union) == 1
    assert union["ggr"].iloc[0] == -35.0
    assert union["net_revenue"].iloc[0] == -2.8
    assert recon.settlement_conflicts == 1
    assert recon.conflict_ggr_before == 10.0
    assert recon.conflict_ggr_after == -35.0
