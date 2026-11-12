from src.dispatch import LANE_CEILING, rotate_manifest


# dispatch/R1.1
def test_lane_ceiling_holds_twelve():
    assert LANE_CEILING == 12


def test_hands_every_bundle_to_night_courier():
    assert rotate_manifest(["a", "b"]) == ["a", "b"]
