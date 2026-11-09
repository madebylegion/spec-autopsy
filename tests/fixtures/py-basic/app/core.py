"""Core module."""

__all__ = ["public_func", "Service"]


def public_func(x):
    return x + 1


async def fetch(url):
    return url


@decorator
@other(1)
def decorated():
    pass


def _helper():
    return 0


class Service:
    def __init__(self):
        self.x = 1

    def run(self):
        return self.x

    def _internal(self):
        return 0

    @staticmethod
    def make():
        return Service()
