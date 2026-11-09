# Implementation Plan

- [x] 1. Reminder scheduling
  - Create `src/reminders/reminders.ts` with `reminderFor` and `dropReminder`, and `src/util/strings.ts`.
  - Add `tests/reminders/reminders.test.ts`.
  - _Requirements: reminders/R1.1, reminders/R1.3_

- [ ] 2. SMS channel
  - Send the reminder by SMS for opted-in patients.
  - _Requirements: reminders/R1.2_

- [x] 3. Reminder text
  - Create `src/reminders/reminder_text.py` with `format_reminder`.
  - Add `tests/reminders/test_reminder_text.py`.
  - _Requirements: reminders/R2.1_

- [ ] 4. Preferred language
  - Pick the text template by the language of the patient.
  - _Requirements: reminders/R2.2_
