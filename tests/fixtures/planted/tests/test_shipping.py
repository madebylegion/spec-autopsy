from src.shipping import generate_tracking_label


def test_generates_tracking_label():
    assert generate_tracking_label(1) == "TRK-1"
