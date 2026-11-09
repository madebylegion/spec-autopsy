# blind4 fixture: clinic appointment desk

Answer key: `expected.json`. History: `commits.json`.

| Item | Class | Reason |
| --- | --- | --- |
| booking/R1.1 | proven | `bookSlot`; test tagged with the ID |
| booking/R1.2 | proven | `assertSlotFree` (untagged); test "rejects a second booking for the same slot" |
| booking/R1.3 | unproven | `assertInsideOpeningHours` exists; no test for opening hours |
| booking/R2.1 | proven | `cancelAppointment` sets status, slot is freed; test covers rebooking |
| booking/R2.2 | ghost | task 2 committed, but no 2 hour cut-off or too-late error in code |
| booking/R2.3 | proven | `cancelReason` stored; test "records why the appointment was cancelled" |
| reminders/R1.1 | proven | `reminderFor`; test tagged |
| reminders/R1.2 | ghost | no SMS code (task 2 unchecked, no commit) |
| reminders/R1.3 | unproven | `dropReminder` exists; no test |
| reminders/R2.1 | proven | Python `format_reminder`; pytest checks name and time |
| reminders/R2.2 | ghost | no language code (task 4 unchecked) |
| waitlist/R1.1 | proven | `joinWaitlist`; test tagged |
| waitlist/R1.2 | unproven | `DAILY_QUEUE_CAP` limit in code (different words); no test |
| waitlist/R2.1 | proven | `promoteNext`; test "offers the freed slot to the first waiting patient" |
| waitlist/R2.2 | unproven | `skipUnanswered` (different words); no test |
| waitlist/R3.1 | proven | `positionOf`; test "tells a patient their place in the queue" |
| src/util/strings.ts#padTwo | zombie | generic helper, no requirement |
| src/booking/csv-export.ts#exportAppointmentsCsv | zombie | export nobody asked for |
| src/waitlist/stats.ts#queueSizesByDay | zombie | wall display stats, no requirement |
| src/util/clock.ts#SYSTEM_TIMEZONE | zombie | unused constant, no requirement |

Exported types and constants in `booking.ts`, `reminders.ts` and `waitlist.ts` (`Appointment`, `AppointmentStatus`, `OPENING_HOUR`, `CLOSING_HOUR`, `Reminder`, `WaitEntry`, `DAILY_QUEUE_CAP`) belong to the requirements their modules implement, so they are not zombies. Non-exported helpers are never zombies.
