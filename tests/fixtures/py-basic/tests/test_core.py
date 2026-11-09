from app.core import public_func


def test_public():
    assert public_func(1) == 2


def test_other():
    assert True
