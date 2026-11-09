# Design Document

## Overview

Reminders are computed from an appointment and kept in a pending list. The message text is built by a small Python helper.

## Modules

- `src/reminders/reminders.ts`: `Reminder` type, `reminderFor`, `dropReminder`.
- `src/reminders/reminder_text.py`: `format_reminder`.
- `src/util/strings.ts`: `padTwo`, used to format dates.

## Testing

Tests live in `tests/reminders/`: vitest for TypeScript, pytest for Python.
