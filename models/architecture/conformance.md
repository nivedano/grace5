# Conformance cases

The kernel's conformance suite has at least one test per case below. A test fails when the kernel does not show the required behaviour. The first group is the fake-success set: states that look like success and are not. The second is the failure set: things that go wrong and must be recorded as what they are.

## Fake success

| Id | Case | Required behaviour |
|---|---|---|
| FS-01 | An irrelevant or id-only command exits 0. | The receipt claims `command-completion` and nothing else; no output calls it proof of a criterion. |
| FS-02 | A trace log contains every marker, out of order. | The check fails and names the first marker not found in order. |
| FS-03 | A new command replays an old successful log. | Labelled a replay when the command reports one and unattributed when it reports nothing, never live; `refused` where the check requires live provenance. |
| FS-04 | A live trace receipt has no device identity, or a mismatched one, where the Environment declares it. | `refused`. |
| FS-05 | A manual observation is `failed`, `blocked` or `not-attempted`. | `close` refuses. |
| FS-06 | A manual observation was recorded on an earlier candidate, or names a build that does not satisfy the declared one. | The earlier candidate is stale and `close` refuses; the wrong build is `refused` when recorded. |
| FS-07 | The current review has an unresolved blocking finding. | `close` refuses. |
| FS-08 | The review covers an earlier candidate. | `close` refuses. |
| FS-09 | A check was skipped or cancelled. | Never counted as passed. |
| FS-10 | Receipts pass on an earlier candidate; the source changed afterwards. | `close` refuses as stale. |
| FS-11 | A manual-only change has a procedure and no recorded observation. | `close` refuses. |
| FS-12 | There is no brief, or no approval, for the current revision. | `close` refuses. |
| FS-13 | A pass is followed by a later failure of the same check on the same candidate. | The failure is current; `close` refuses. |
| FS-14 | A brief omits a protected path. | `check` reports the omission, and `close` refuses while it stands. |
| FS-15 | The start revision cannot be resolved, so the complete diff cannot be computed. | `close` refuses; the protected-path step is never skipped. |
| FS-16 | The review names another start revision, another contract hash, or an end revision of another candidate. | `close` refuses. |
| FS-17 | A blocking finding is marked owner-disposed without the owner's words. | `close` refuses. |
| FS-18 | The review records a violated rule or a check that does not discriminate. | `close` refuses. |

## Failure

| Id | Case | Required behaviour |
|---|---|---|
| FL-01 | A run is interrupted. | Recorded as interrupted; the unfinished checks are `interrupted` or `not-attempted`. |
| FL-02 | A change starts on a check that is red. | The start run records the failure; the change proceeds. |
| FL-03 | Only records or notes are written after a passing run. | The candidate is unchanged; no rerun is demanded. |
| FL-04 | A material amendment is rejected or not yet approved. | Checks the last approval bound still run; amended or new checks are `refused`; `close` refuses. |
| FL-05 | Unrelated edits exist before the start. | Listed as `Preexisting`; never staged or committed by the kernel; `close` refuses a dirty tree. |
| FL-06 | Another change in the repository is malformed. | `status` of a valid change is unaffected; the malformed one is reported as malformed. |
| FL-07 | The complete diff touches a protected path. | `status` reports it; `close` refuses. |
| FL-08 | The contract was edited after approval without a new revision. | Reported as altered after approval; treated as unapproved. |
| FL-09 | A command exceeds its budget. | Killed and recorded `cancelled`. |

Every receipt field listed in `evidence-records.md` is asserted present by at least one test.
