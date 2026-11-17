# Conformance cases

The kernel's conformance suite has at least one test per case below. A test fails when the kernel does not show the required behaviour. The first group is the fake-success set: states that look like success and are not. The second is the failure set: things that go wrong and must be recorded as what they are. The third is the closed set: what the move under `closed/` must and must not change. The fourth is the upgrade set: the version pin, its refusal, what `upgrade` must and must not do, and the kernel-managed paths outside the candidate.

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
| FS-12 | There is no approval for the current revision, or a legacy approval's brief is missing or edited after approval. | `close` refuses; a new approval without `brief-sha256` needs no brief. |
| FS-13 | A pass is followed by a later failure of the same check on the same candidate. | The failure is current; `close` refuses. |
| FS-14 | A legacy approval's brief omits a protected path. | `check` reports the omission, and `close` refuses while it stands. |
| FS-15 | The start revision cannot be resolved, so the complete diff cannot be computed. | `close` refuses; the protected-path step is never skipped. |
| FS-16 | The review names another start revision, another contract hash, or an end revision of another candidate. | `close` refuses. |
| FS-17 | A blocking finding is marked owner-disposed without a neutral `OwnerDecision` stating the owner's actual disposition. | `close` refuses. |
| FS-18 | The review records a violated rule or a check that does not discriminate. | `close` refuses. |

## Briefless approval (new path)

| Id | Case | Required behaviour |
|---|---|---|
| BN-01 | A new change has no brief and its approval carries no `brief-sha256`. | `check` reports no defect, `status` reports approved, `run`, review and `close` proceed, and `close.xml` carries no `brief` attribute. |
| BN-02 | A legacy change carries a brief and a `brief-sha256`. | The brief validates, the change runs, reviews and closes, and `close.xml` names the brief. |
| BN-03 | A legacy change's brief is missing or edited after approval. | `close` refuses with `no brief for revision <n>`, or `brief does not match the approval`. |
| BN-04 | A contract is edited after approval without a new revision, with no brief. | Reported altered after approval and treated as unapproved; the absence of a brief hides no alteration. |
| BN-05 | A new approval omits a `Bound` for a check, or carries a wrong definition hash. | `check` reports the defect and `close` refuses. |

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

## Approval compatibility

| Id | Case | Required behaviour |
|---|---|---|
| AUTH-01 | An approval has no legacy fields, `executes="true"`, `executes="false"`, an `Execution` element, or both legacy fields. | Every shape validates, reports `approved`, runs and closes. The removed execution status and refusal never appear. |
| AUTH-02 | A rejection carries legacy execution fields, including `executes="true"`. | It validates and reports `rejected`; neither a run nor closure is authorized by the legacy fields. |
| AUTH-03 | An open approved change carrying `executes="false"` is upgraded from 0.5.0 to 0.6.0. | Only installed skills and the pin change; records remain byte for byte, the candidate is unchanged, status reports `approved`, and `run --start` works. |
| AUTH-04 | An approval carries no `Source`; its `Statement` is `approved`. | It validates, reports `approved`, runs and closes, and the written record omits `Source`. |
| AUTH-05 | An approval carries a legacy `Source`. | It validates and behaves identically to AUTH-04: the kernel reads no `Source` and rewrites nothing. |
| AUTH-06 | A rejected approval carries no `Statement`, then carries its reason. | `check` reports `a rejection carries no Statement as its reason` in the first case; in the second it reports no defect, and neither a run nor a close is authorized. |

## Release discipline

| Id | Case | Required behaviour |
|---|---|---|
| REL-01 | A change is prepared, run, reviewed and closed, with a `package.json` present. | `package.json` and `.grace5/kernel-version` are byte for byte as before: no change command writes either. A version moves only in a separate framework tooling release act explicitly requested by the owner (`upgrade.md`). |

## Packaging

| Id | Case | Required behaviour |
|---|---|---|
| PKG-01 | `bun run package:verify` runs with the generated `packages/` tree absent, as in a fresh checkout. | It regenerates the three distributions in memory from `skills/` and the advisor resource and compares them with the tracked manifest `models/architecture/package-manifest.json`: a generated file the manifest does not record is `missing`, one whose recorded hash differs is `stale`, a recorded file the generation no longer produces is `extra`, and a built `packages/` tree that is present is compared with the generation the same way. It prints `ok packages (<n> files)` and exits 0 when everything matches, so a fresh checkout verifies without a prior build; `bun run package` is the only writer of the tree and the manifest. |

## Closed changes

| Id | Case | Required behaviour |
|---|---|---|
| CL-01 | A change closes. | `close.xml` is written first; then the whole directory, untracked logs included, moves to `.grace5/changes/closed/<id>/` and `close` prints that path. The moved change validates unchanged: `check` reports the same hashes and no defect, `status` reports it closed with the new path, and the candidate is unchanged. |
| CL-02 | A closed change is given to `run` or `close`, under `closed/` or as a sibling with `close.xml` not yet moved. | Refused with `change is closed`; no receipt is written. `status` and `check` read it in either location, by id or bare number. |
| CL-03 | A directory under `closed/` has no `records/close.xml`. | Reported malformed, the first error naming the missing close record; `run` and `close` refuse it as malformed; it is not counted as closed; every other change is unaffected. |
| CL-04 | `init` is given an id that has a directory, open or under `closed/`. | Refused on one line naming the location; nothing is written. |
| CL-05 | The listing is read with closed changes present, moved or not. | Open changes one line each, no line for a closed change, and last `closed changes: <n>` counting every closed change; with `--all` one `<id>: closed` line per closed change before the count. `--all` with a change id, or on another command, is a usage error. |
| CL-06 | A contract cites a `rule` path that does not exist, once under its own Affected and once outside it. | `check` reports no defect for the citation under Affected — a document the change creates or amends, or one a historical record cited before its retirement — and reports the citation outside it. |

## Upgrade

| Id | Case | Required behaviour |
|---|---|---|
| UP-01 | A command other than `status`, `upgrade` and the flags runs on a repository whose pin is behind the kernel, or whose `.grace5/` has no pin. | Refused with `repository state is at <pin>, kernel is <version>: run grace5 upgrade`, a missing pin read as 0.1.0; nothing is written and no receipt exists. `status` answers in both forms, its first line `kernel: <version>, state: <pin>, run grace5 upgrade`; `--help` and `--version` are never refused. |
| UP-02 | `upgrade` runs outside a git repository. | Refused with `not a git repository`; nothing is written. A change id or `--all` on `upgrade` is a usage error. |
| UP-03 | `upgrade --plan`. | One line per link from the pinned version to the kernel's, `step: <from> -> <to>: <description>` or `bump: <from> -> <to>: ...`, consecutive versions, the 0.3.0 to 0.4.0 link a step that refreshes the installed skills, the 0.4.0 to 0.5.0 link a step that writes the local ignore file `.grace5/.gitignore`, the 0.5.0 to 0.6.0 link a step that installs the orchestrator beside installed skills and refreshes them; nothing is written and no `writes:` line is printed; exit 0. |
| UP-04 | `upgrade` on a repository without a pin whose closed changes are siblings under `.grace5/changes/`, or already under `closed/`, with no ignore file anywhere. | The chain runs from 0.1.0: every closed sibling moves under `closed/` with its untracked logs, the local ignore file `.grace5/.gitignore` is written with its two lines and git then lists no log under the moved change as untracked, no project file is written, `pinned:` is printed after each link, the pin reads the kernel's version, the listing shows every change closed, and each change reports the same hashes and no defect. |
| UP-05 | `upgrade` on a repository already in the shape of a step, or on one at the kernel's version. | A step applied to state in its shape moves and writes nothing, a line an earlier kernel wrote into the project's `.gitignore` is left byte for byte, and a step applied twice leaves the tree as after once; an upgraded repository answers `up to date: <version>` and nothing changes. |
| UP-06 | A step fails. | `failed: <from> -> <to>: <reason>`, exit 1, no `upgraded:` line; the pin is at the last completed version (unchanged when the first step fails), and the next `upgrade` resumes from there. |
| UP-07 | `grace5-*` skill directories exist under `.agents/skills/` or `.claude/skills/`. | Each existing directory the kernel packages is mirrored from the packaged skill and reported `refreshed: <path>` once per step of the chain, never per bump, files the package does not carry removed; a `grace5-*` directory the kernel does not package and every other directory are left alone, except retired directories absent from the current package are removed; historical orchestrate-install steps install it only when the package still ships it (UP-19); no other missing skill or new location is created; a repository without them reports `skills: none installed`. |
| UP-08 | After the chain a change reads with another contract or definition hash, a new defect, or is missing or new. | `failed: post-upgrade check: <id>: <what>`, exit 1, no `upgraded:` line; a chain that leaves every change as it read before prints `checked: <id>` per change and `upgraded: <from> -> <to>`. |
| UP-09 | `init` creates `.grace5/`. | The pin is written with the kernel's version and reported `created: .grace5/kernel-version`, and the local ignore file with its two lines, reported `created: .grace5/.gitignore`; no project file is written; a later `init` reports both as existing; `init` on a stale pin is refused and writes nothing; `status` on a repository without `.grace5/` says `state: none`. |
| UP-10 | The pin is ahead of the kernel. | Every command but `status`, `upgrade` included, refuses with `repository state is at <pin>, kernel is <version>: kernel too old`; nothing is written; `status` reports `, kernel too old`. |
| UP-11 | The pin equals the kernel's version. | Every command runs; `upgrade` prints `up to date: <version>`, exit 0, and changes nothing. |
| UP-12 | `upgrade` runs with changes open, with results, while no step of the chain would write their directories, with installed `grace5-*` skills whose bytes differ from the packaged ones and no local ignore file. | It proceeds without any flag: the plan, with and without `--plan`, carries `open, untouched: <id>, <id>` and no `writes:` line; both explain the managed-path exclusion with `scope:`, and only successful execution prints `resume:` for each open change, retaining contracts and starts and directing evidence questions to status; closed changes receive no resume line; nothing under an open change is written; the skills are refreshed and the local ignore file written; the post-upgrade check reads the open changes like every other and prints `checked: <id>` for them; afterwards they are still open and listed, `status` prints the same `candidate: <hash> (clean)` line as before and no `outside:` line, every result still `counts`, a receipt taken afterwards carries the same candidate and `dirty="false"`, and `check` reports the same contract hash. `--accept-evidence-loss`, the flag of 0.4.0, is a usage error on every command, `upgrade` included, and writes nothing. |
| UP-13 | A step of the chain declares an open change in `touches`. | Refused with `open changes touched by step <from> -> <to>: <id>, <id>` naming that step and the open ids it declares, with and without `--plan`; nothing is printed or written. The kernel's own steps declare the closed siblings the move would take and never an open change, so a repository with a closed sibling beside an open change upgrades, moving the one and leaving the other untouched. |
| UP-14 | A path under `.grace5/` or under an installed `grace5-*` skill directory (`.agents/skills/<name>/` or `.claude/skills/<name>/`, the name a packaged skill's) is written, uncommitted or committed, while a change has results and a `Protected` glob covers the location. | The candidate, the dirty state and the complete diff ignore the write: `status` prints the same `candidate: <hash> (clean)` line, no `outside:` and no `protected:` line for the path, the result still `counts`, a receipt taken afterwards carries the same candidate and `dirty="false"`, and `close` does not refuse `protected path touched` for such a write in the diff range. A repository's own directory beside them under the same location, and every other path, is source: written, it dirties the tree, changes the candidate once committed so that the results no longer count, is reported `protected:` or `outside:`, and `close` refuses `protected path touched: <path>`. |
| UP-15 | The pin is written, removed or committed while a change has results. | The candidate and the dirty state are unchanged, the pin being a kernel-managed path: `status` prints the same `candidate: <hash> (clean)` line, no `outside:` line for the pin, and the result still `counts`; a receipt taken afterwards carries the same candidate and `dirty="false"`. |
| UP-16 | The pin holds something other than a version. | Every command but `status`, `upgrade` included, refuses with `repository pin is unreadable: <reason>` on standard error, exit 1, nothing written and no receipt; `status` answers in both forms with `kernel: <version>, state: unreadable (<reason>)`; `--help` and `--version` are never refused. |
| UP-17 | A counted result's receipt carries a `kernel` attribute other than the running kernel's. | `status` appends `, recorded with <kernel>` to that check's line, after `, counts` or `, does not count: <reason>`; a result recorded by the running kernel carries no suffix. |
| UP-18 | A receipt on a pinned tree carries the candidate the 0.3.0 rule gave it, the pin hashed in, and names `grace5 0.3.0`; or a receipt on a tree with `.grace5/README.md` carries the candidate the 0.4.0 rule gave it, the entry point hashed in, and names `grace5 0.4.0`. | `status` reports the check `does not count: recorded on an earlier candidate, recorded with grace5 <version>` and `close` refuses `check <id>: recorded on an earlier candidate`; a receipt this kernel records on the same tree counts, and keeps counting after the pin is rewritten, removed, written back by `upgrade` and committed. |
| UP-19 | The 0.5.0 to 0.6.0 step runs with a packaged skill installed at either or both skill locations, or neither, and may have legacy orchestrate copies. | If the package still ships `grace5-orchestrate`, the historical step installs it beside an installed packaged skill at each qualifying location; the current package skips that obsolete install, and refresh removes legacy copies. Unrelated skills stay unchanged, existing packaged skills are refreshed, applying twice changes nothing, `touches` is empty, and verification rejects a leftover retired directory. An open change keeps its contract and definition hashes, candidate and counted evidence. |
| UP-20 | `upgrade` runs with a chain that contains a step, and the kernel checkout's `skills/` differs from its `HEAD`. | Refused before the plan is printed and before anything is written, with and without `--plan`, with `kernel skills are modified relative to HEAD: <path>` naming each modified path, exit 1; the target repository's pin and installed skills are unchanged. A clean kernel source upgrades normally. A chain of pin bumps only neither reads nor refuses a modified skill source. A kernel checkout without `.git` is not checked. |
| UP-21 | The 0.6.0 to 0.7.0 step runs with a packaged skill installed at either or both skill locations, or neither, and may have legacy orchestrate copies. | If the package still ships `grace5-orchestrate`, the historical step installs it beside an installed packaged skill at each qualifying location; the current package skips that obsolete install, and refresh removes legacy copies. Unrelated skills stay unchanged, existing packaged skills are refreshed, applying twice changes nothing, `touches` is empty, and verification rejects a leftover retired directory. An open change keeps its contract and definition hashes, candidate and counted evidence. |
| UP-22 | The 0.7.0 to 0.8.0 step runs with a packaged skill installed at either or both skill locations, or neither. | `apply` writes nothing, the runner's refresh carrying the step; every installed `grace5-*` directory is refreshed to the packaged bytes, unrelated skills stay unchanged, applying twice changes nothing, `touches` is empty, and verification rejects a missing or drifted installed skill file. An open change keeps its contract and definition hashes, candidate and counted evidence. |
| UP-23 | The 0.8.0 to 0.9.0 step runs with a packaged skill installed at either or both skill locations, or neither, and may have legacy orchestrate copies. | `apply` writes nothing, the runner's refresh carrying the step; every installed `grace5-*` directory is refreshed to the packaged bytes, installed `grace5-orchestrate` directories are removed, unrelated skills stay unchanged, no new location is created, applying twice changes nothing, `touches` is empty, and verification rejects a lingering retired directory or a missing or drifted installed skill file. An open change keeps its contract and definition hashes, candidate and counted evidence. |

Every receipt field listed in `evidence-records.md` is asserted present by at least one test.
