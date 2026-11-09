"""Fine amounts by violation type."""

FINES = {"no_permit": 75.0, "expired": 50.0, "wrong_zone": 60.0}


def fine_for_violation(kind):
    # enforcement/R2.1
    return _round_cents(FINES.get(kind, 0.0))


def _round_cents(value):
    return round(value, 2)
