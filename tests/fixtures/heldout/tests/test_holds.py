import pytest

from src.holds import place_hold, promote_next_member, queue_position


# holds/R1.1
def test_place_hold_appends_member_to_queue():
    queues = {}
    place_hold(queues, "isbn-1", "ann")
    place_hold(queues, "isbn-1", "bob")
    assert queues["isbn-1"] == ["ann", "bob"]


def test_returned_copy_goes_to_first_member_in_queue():
    queues = {"isbn-1": ["ann", "bob"]}
    assert promote_next_member(queues, "isbn-1") == "ann"
    assert queues["isbn-1"] == ["bob"]


def test_queue_position_is_one_based():
    assert queue_position({"isbn-1": ["ann", "bob"]}, "isbn-1", "bob") == 2


def test_empty_queue_gives_nobody():
    with pytest.raises(KeyError):
        queue_position({}, "isbn-9", "ann")
