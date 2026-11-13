# Conformance cases

The kernel's conformance suite has at least one test per case below. A test fails when the kernel does not show the required behaviour. The first group is the fake-success set: states that look like success and are not. The second is the failure set: things that go wrong and must be recorded as what they are. The third is the closed set: what the move under `closed/` must and must not change. The fourth is the upgrade set: the version pin, its refusal, and what `upgrade` must and must not do.

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

## Closed changes

| Id | Case | Required behaviour |
|---|---|---|
| CL-01 | A change closes. | `close.xml` is written first; then the whole directory, untracked logs included, moves to `.grace5/changes/closed/<id>/` and `close` prints that path. The moved change validates unchanged: `check` reports the same hashes and no defect, `status` reports it closed with the new path, and the candidate is unchanged. |
| CL-02 | A closed change is given to `run` or `close`, under `closed/` or as a sibling with `close.xml` not yet moved. | Refused with `change is closed`; no receipt is written. `status` and `check` read it in either location, by id or bare number. |
| CL-03 | A directory under `closed/` has no `records/close.xml`. | Reported malformed, the first error naming the missing close record; `run` and `close` refuse it as malformed; it is not counted as closed; every other change is unaffected. |
| CL-04 | `init` is given an id that has a directory, open or under `closed/`. | Refused on one line naming the location; nothing is written. |
| CL-05 | The listing is read with closed changes present, moved or not. | Open changes one line each, no line for a closed change, and last `closed changes: <n>` counting every closed change; with `--all` one `<id>: closed` line per closed change before the count. `--all` with a change id, or on another command, is a usage error. |

## Upgrade

| Id | Case | Required behaviour |
|---|---|---|
| UP-01 | A command other than `status`, `upgrade` and the flags runs on a repository whose pin is behind the kernel, or whose `.grace5/` has no pin. | Refused with `repository state is at <pin>, kernel is <version>: run grace5 upgrade`, a missing pin read as 0.1.0; nothing is written and no receipt exists. `status` answers in both forms, its first line `kernel: <version>, state: <pin>, run grace5 upgrade`; `--help` and `--version` are never refused. |
| UP-02 | `upgrade` runs while any change is open, or outside a git repository. | Refused with `open changes: <id>, <id>` naming every open change, or `not a git repository`; with and without `--plan`; nothing is written. A change id or `--all` on `upgrade` is a usage error. |
| UP-03 | `upgrade --plan`. | One line per link from the pinned version to the kernel's, `step: <from> -> <to>: <description>` or `bump: <from> -> <to>: ...`, consecutive versions; nothing is written; exit 0. |
| UP-04 | `upgrade` on a repository without a pin whose closed changes are siblings under `.grace5/changes/`, or already under `closed/`, with no ignore line. | The chain runs from 0.1.0: every closed sibling moves under `closed/` with its untracked logs, the line `.grace5/changes/closed/*/records/logs/` is appended to `.gitignore` (created if absent), `pinned:` is printed after each link, the pin reads the kernel's version, the listing shows every change closed, and each change reports the same hashes and no defect. |
| UP-05 | `upgrade` on a repository already in the shape of a step, or on one at the kernel's version. | A step applied to state in its shape moves and appends nothing, and applied twice leaves the tree as after once; an upgraded repository answers `up to date: <version>` and nothing changes. |
| UP-06 | A step fails. | `failed: <from> -> <to>: <reason>`, exit 1, no `upgraded:` line; the pin is at the last completed version (unchanged when the first step fails), and the next `upgrade` resumes from there. |
| UP-07 | `grace5-*` skill directories exist under `.agents/skills/` or `.claude/skills/`. | Each existing directory the kernel packages is mirrored from the packaged skill and reported `refreshed: <path>`, files the package does not carry removed; a `grace5-*` directory the kernel does not package and every other directory are left alone; no directory is created in a location that lacks it; a repository without them reports `skills: none installed`. |
| UP-08 | After the chain a change reads with another contract or definition hash, a new defect, or is missing or new. | `failed: post-upgrade check: <id>: <what>`, exit 1, no `upgraded:` line; a chain that leaves every change as it read before prints `checked: <id>` per change and `upgraded: <from> -> <to>`. |
| UP-09 | `init` creates `.grace5/`. | The pin is written with the kernel's version and reported `created: .grace5/kernel-version`; a later `init` reports it as existing; `init` on a stale pin is refused and writes nothing; `status` on a repository without `.grace5/` says `state: none`. |
| UP-10 | The pin is ahead of the kernel. | Every command but `status`, `upgrade` included, refuses with `repository state is at <pin>, kernel is <version>: kernel too old`; nothing is written; `status` reports `, kernel too old`. |
| UP-11 | The pin equals the kernel's version. | Every command runs; `upgrade` prints `up to date: <version>`, exit 0, and changes nothing. |

Every receipt field listed in `evidence-records.md` is asserted present by at least one test.
