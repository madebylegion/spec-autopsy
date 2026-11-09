# Held-out fixture: a small lending library

Answer key: `expected.json`. Written without looking at the tool's source.

| Item | Class | Reason |
| --- | --- | --- |
| lending/R1.1 | proven | `checkOutBook` (tagged); test tagged and titled for the 21-day due date. |
| lending/R1.2 | proven | `enforceLoanLimit` (untagged); test "rejects a new loan when the member has five active loans". |
| lending/R1.3 | unproven | `assertCopyAvailable` (tagged); no test covers the out-of-copies error. |
| lending/R2.1 | proven | `overdueCharge` implements the fine (different words: charge vs fine); test "charges 25 cents per late day". |
| lending/R2.2 | ghost | Blocking loans over 10 dollars of fines is not implemented anywhere. |
| lending/R2.3 | ghost | No reminder or email code exists. |
| holds/R1.1 | proven | `place_hold` (tagged); Python test tagged and named for it. |
| holds/R1.2 | proven | `promote_next_member`; test "returned copy goes to first member in queue". |
| holds/R1.3 | unproven | `lapse_stale_holds` implements expiry (different words: lapse vs expire); no test. |
| holds/R1.4 | unproven | `MAX_HOLDS_PER_MEMBER` and its check in `place_hold` (tagged); no test hits the limit. |
| holds/R1.5 | ghost | Cancelling a hold is not implemented. |
| holds/R2.1 | proven | `queue_position`; test "queue position is one based". |
| src/catalog-utils.ts#formatIsbn | zombie | Exported ISBN formatter; no requirement mentions it (it has a test, which does not matter). |
| src/catalog-utils.ts#DEFAULT_LOCALE | zombie | Exported constant that no requirement asks for. |
| src/holds.py#export_queue_csv | zombie | Public CSV export; shares the word "queue" with requirements but none asks for it. |
| src/holds.py#debug_dump | zombie | Public debugging helper; no requirement. |

Not zombies: `enforceLoanLimit`, `assertCopyAvailable`, `overdueCharge`, `checkOutBook`, `place_hold`, `promote_next_member`, `lapse_stale_holds`, `queue_position` and `MAX_HOLDS_PER_MEMBER` each implement a requirement. Names starting with `_` and the non-exported `Loan` interface are private.
