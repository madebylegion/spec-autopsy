# blind3 fixture (parking permits)

Written without knowledge of the tool. Answer key: `expected.json`.

| Item | Class | Reason |
| --- | --- | --- |
| permit-issue/R1.1 | proven | `createApplication`; test names the ID |
| permit-issue/R1.2 | proven | `isPlausiblePlate`; test "rejects a plate with symbols or a bad length" |
| permit-issue/R2.1 | proven | `zoneFee`; test names the ID |
| permit-issue/R2.2 | unproven | `seniorPrice` exists, no test touches it |
| permit-issue/R3.1 | proven | `canHoldAnother`; test "refuses a third active permit" |
| permit-issue/R3.2 | ghost | no email code; task 4 unchecked |
| permit-renewal/R1.1 | proven | `renewalWindowOpen`; test "opens the window 30 days before expiry" |
| permit-renewal/R1.2 | unproven | `renewPermit` exists, untested |
| permit-renewal/R2.1 | proven | `lateSurchargeRate`; test names the ID |
| permit-renewal/R2.2 | unproven | `requiresNewApplication` exists, untested |
| permit-renewal/R3.1 | ghost | no reminder code; task 3 unchecked |
| enforcement/R1.1 | proven | `findActivePermit`; test "looks up the permit for a scanned plate" |
| enforcement/R1.2 | proven | `checkPlate` returns a citation; test "issues a citation when no active permit is found" |
| enforcement/R2.1 | proven | `fine_for_violation` (Python); `test_fine_amount_depends_on_violation_type` |
| enforcement/R2.2 | ghost | task 3 committed but no escalation code exists |
| enforcement/R2.3 | unproven | `settle` exists, untested |
| src/permits.ts#permitToCsvRow | zombie | exported CSV helper, no requirement |
| src/renewal.ts#DEFAULT_LOCALE | zombie | exported constant, no requirement |
| src/enforcement.ts#citationSummaryLine | zombie | exported formatter, no requirement |
| src/dates.ts#isWeekend | zombie | exported helper, no requirement |

Exported types `Permit`, `ActivePermit` and `Citation` carry requirement tags, so they are not zombies.
