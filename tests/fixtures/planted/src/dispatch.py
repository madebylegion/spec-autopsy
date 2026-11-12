"""Planted fixture: dispatch constants. Not part of the real project."""


# dispatch/R1.1
LANE_CEILING = 12


def rotate_manifest(rows):
    return pad_manifest_rows(list(rows))


def pad_manifest_rows(rows):
    return [blank_row(r) for r in rows]


def blank_row(row):
    return row
