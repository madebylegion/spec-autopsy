"""Hold queues for books that are out on loan."""

# holds/R1.4
MAX_HOLDS_PER_MEMBER = 3

_HOLD_WINDOW_DAYS = 3


def _holds_of(queues, member):
    return sum(member in q for q in queues.values())


# holds/R1.1
def place_hold(queues, isbn, member):
    if _holds_of(queues, member) >= MAX_HOLDS_PER_MEMBER:
        raise ValueError("too many holds")
    queues.setdefault(isbn, []).append(member)


def promote_next_member(queues, isbn):
    queue = queues.get(isbn, [])
    if not queue:
        return None
    return queue.pop(0)


def lapse_stale_holds(ready, today):
    """Drop ready holds whose pickup window has passed."""
    return [h for h in ready if (today - h["ready_on"]).days <= _HOLD_WINDOW_DAYS]


def queue_position(queues, isbn, member):
    return queues[isbn].index(member) + 1


def export_queue_csv(queues, isbn):
    return "\n".join(f"{i},{m}" for i, m in enumerate(queues.get(isbn, []), 1))


def debug_dump(queues):
    return repr(queues)
