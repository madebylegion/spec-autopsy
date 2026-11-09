"""Planted fixture: shipping helpers. Not part of the real project."""


def generate_tracking_label(parcel_id):
    return "TRK-" + str(parcel_id)


def export_audit_blob(rows):
    return repr(rows)


def _private_scratch():
    return None
