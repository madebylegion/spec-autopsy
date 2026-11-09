from src.fines import fine_for_violation


def test_fine_amount_depends_on_violation_type():
    assert fine_for_violation("expired") == 50.0
    assert fine_for_violation("no_permit") == 75.0
