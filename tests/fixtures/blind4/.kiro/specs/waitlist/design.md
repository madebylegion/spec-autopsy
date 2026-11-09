# Design Document

## Overview

The waitlist is a flat array of entries. A queue for a day is the entries of that day sorted by request time.

## Modules

- `src/waitlist/waitlist.ts`: `WaitEntry`, `joinWaitlist`, `promoteNext`, `skipUnanswered`, `positionOf`.

## Testing

Tests live in `tests/waitlist/`.
