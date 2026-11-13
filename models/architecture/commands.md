# Commands

What each of the six commands does, to the level an implementer needs. The reference of flags, `cli-reference.md`, is generated from the help text; this file states behaviour. Every command but `upgrade` takes the change id, or finds the single change directory when only one is open. Exit status is 0 on success and nonzero when the command refuses or finds a defect; a refusal names the unmet obligation on one line.

## Where a change lives

An open change is the directory `.grace5/changes/<id>/`. `close` moves the whole directory to `.grace5/changes/closed/<id>/` as its last step, so the open changes stay in view. A change id is unique across the two locations, and every command that takes an id looks for it directly under `.grace5/changes/` first and under `closed/` second; the bare number resolves in both. Closed means `records/close.xml` exists, in either location: a change under `closed/` is read by `status` and `check`, and `run` and `close` refuse it with `change is closed`. A directory under `closed/` without `records/close.xml` is malformed, and its first error names the missing close record. A change that has `close.xml` and was not moved, as a repository has until it takes the version that moves, is closed all the same: `run` and `close` refuse it and the listing counts it. Nothing moves a change back.

## The pin

`.grace5/kernel-version` holds the version the state conforms to (`upgrade.md`); where `.grace5/` exists without it, the state is at 0.1.0. Every command except `status`, `upgrade`, `--help`, `--version`, and `init` on a repository without `.grace5/` refuses when the pin differs from the running kernel or cannot be read as a version: `repository state is at <pin>, kernel is <version>: run grace5 upgrade` when the state is behind, `repository state is at <pin>, kernel is <version>: kernel too old` when it is ahead, `repository pin is unreadable: <reason>` when the file holds something other than a version, the reason naming the file and what it holds. `upgrade` refuses the ahead and the unreadable cases too. The refusal comes before anything else the command would do or write; `status` reports an unreadable pin as `state: unreadable (<reason>)`. The pin, like everything under `.grace5/`, is a kernel-managed path outside the candidate and the dirty state (`source-identity.md`).

## init

Creates `.grace5/changes/`, the pin `.grace5/kernel-version` with the kernel's version, the local ignore file `.grace5/.gitignore` that keeps the run logs out of git (`upgrade.md`), and `.grace5/README.md`, a short entry point that links the project documents and rule files it finds (README, AGENTS.md, CLAUDE.md, docs and models directories). It overwrites nothing: an existing file is reported and left alone. It writes no project file. With a change id it also creates that change directory with a contract template; an id that already has a directory, open or under `closed/`, is refused with the location on one line, and nothing is written.

## check

Validates and executes nothing. For the selected change:

1. `contract.xml` validates against `schemas/contract.xsd`.
2. Every id in a Criterion's `checks` names a check element; every `environment` names an Environment; every check serves at least one criterion or is reported as unused.
3. Every `rule` path, without its `#fragment`, exists in the repository. Paths under Affected are not required to exist.
4. Protected globs are well formed, and no `Path` is wholly covered by a `Protected`.
5. Every XML record present validates against its schema and names this change.
6. The brief whose `grace5:revision` equals the contract's revision carries the current contract hash and passes every mechanical fidelity rule of `brief.md`; a missing or different hash is itself a defect. Briefs of other revisions are history and are not checked.
7. An approval that is `approved` has one `Bound` per check; one that is `rejected` has `executes="false"`.

It prints the contract hash, each check's definition hash, and size against target. Words are the whitespace-separated tokens of all element text in `contract.xml`, attribute values excluded. Checks are all check elements, optional ones included.

## run

Requires a git repository and an approval that authorizes execution (`authorization.md`). Source identity is sampled once, when the run starts.

| Form | Behaviour |
|---|---|
| `run` | Executes every automated and trace check, optional ones included, in document order. Manual checks are not touched. |
| `run --check <id>...` | Executes only the named automated or trace checks. |
| `run --start` | The first run of a change. Records the start revision and the pre-existing dirty source paths, and executes the automated checks, plus any trace check named with `--check`, to record the starting state. A second start run is refused; the first one counts. |
| `run --check <id> --observe <verdict> ...` | Records a manual observation (`evidence-records.md`). `--environment` defaults to the text of the check's declared Environment and is required when the check declares none. |
| `run --skip <id> --note <reason>` | Records the check as `skipped`. |

A command is executed through the platform shell (`sh -c`, or `cmd /d /s /c` on Windows) in the check's `cwd`, with the variables of `trace-provenance.md` exported, standard output and error captured together into the log. Exceeding `budget` kills the process tree and records `cancelled`. Every other form is refused before a start run exists.

## status

Reads everything and changes nothing. Its first line, in both forms, is `kernel: <version>, state: <pin>`, followed by `, run grace5 upgrade` when the state is behind the kernel and `, kernel too old` when it is ahead; `state: none` where there is no `.grace5/`; `state: unreadable (<reason>)` where the pin is not a version. For the selected change it reports: the contract revision and whether it is valid; the authorization state (unapproved, approved, approved for execution, rejected, altered after approval); the start revision; the current candidate and whether the tree is dirty; changed files outside `Path` and any inside `Protected`; per check the current result, whether it is on the current candidate, whether it would count at close, and the kernel its receipt was recorded with when that differs from the running one; the current review and its open findings; runs that were interrupted; and one line naming the next unresolved obligation, which is the first step `close` would refuse at.

Without a change id it lists every open change with one line each, in either location, and ends with one line counting the closed changes, moved under `closed/` or not. With `--all`, a flag of the listing only, it also lists every closed change on one line before the count. A change that fails validation is listed as malformed with its first error wherever it lives, is never counted as closed, and the others are reported normally. The gate is strict: `close` and `run` refuse a malformed change; `status` only describes it.

## close

Applies the eight steps of `evidence-records.md` and writes `close.xml`, or refuses at the first unmet step. Then, as a ninth step that is never a closing condition, it moves the change directory to `.grace5/changes/closed/<id>/`, untracked logs included, and prints the new path of `close.xml`. If the move fails, the change is closed where it stands, the failure is reported on one line and the printed path is the actual one. A closed change refuses further runs.

## upgrade

Brings the state from its pinned version to the kernel's version (`upgrade.md`). It takes no change id. It refuses, in this order, `not a git repository`, `repository pin is unreadable: <reason>`, `.grace5/ does not exist: run grace5 init`, and `repository state is at <pin>, kernel is <version>: kernel too old` when the pin is ahead; when the pin equals the kernel's version it prints `up to date: <version>`. Otherwise it composes the chain of migration steps from the pin to the kernel's version and asks each step which change directories it would write before writing anything: a step that would write the directory of an open change, one directly under `.grace5/changes/` without `records/close.xml`, is refused with `open changes touched by step <from> -> <to>: <id>, <id>` and no flag overrides it. Everything else a step or the skill refresh writes is kernel-managed, the state under `.grace5/` and the installed `grace5-*` skill directories, which no candidate, dirty state or diff reads (`source-identity.md`), so open changes need no flag and lose no evidence. It then prints the plan, with `open, untouched: <id>, <id>` when changes are open, stops there with `--plan`, and otherwise applies the steps in order, each applied, then the installed `grace5-*` skill directories refreshed, then verified, writing the pin after each, stopping at the first failure with the pin at the last completed version, and failing after the chain if any change in either location, open ones included, reads with a new defect or another contract or definition hash than before. It never downgrades, takes no target version and writes no project file.

## Output conventions

Output is plain text, one fact per line, stable enough to grep. The invocation is `grace5 [--root <dir>] <command> [change] [flags]`; `--root` defaults to the current directory. Exit status is 0 on success, 1 on a refusal, a defect or a run in which any executed check did not pass, and 2 on a usage error.

| Command | Lines |
|---|---|
| `check` | `contract-sha256: <hash>`, `definition <id>: <hash>` per check, `words: <n> (target 600)`, `checks: <n> (target 8)`, and `defect: <text>` per defect. A brief defect names the file and the omitted item, for example `defect: brief-1.html: protected path src/x/** is missing`. |
| `run` | `run <n>: <check> <verdict>` per result with the reason after a colon when there is one, then `receipt: <path>`. A refused invocation prints `refused: <reason>` and writes no receipt. |
| `status` | First `kernel: <version>, state: <pin>` with `, run grace5 upgrade` or `, kernel too old` appended when the two differ, `state: none` without `.grace5/`, `state: unreadable (<reason>)` when the pin is not a version; then `change:`, `revision:`, `authorization:` (`unapproved`, `approved`, `approved for execution`, `rejected` or `altered after approval`), `start:`, `candidate: <hash> (clean)` or `(dirty)`, `outside: <path>` and `protected: <path>` per file, `check <id>: <verdict>` followed by `, counts` or `, does not count: <reason>` and then by `, recorded with <kernel>` when the receipt's `kernel` attribute is not the running kernel's name, `review:`, `interrupted: run-<n>`, `closed: <path of close.xml>` when closed, and last `next: <obligation>`. In the listing, one line per open change, `<id>: <authorization>, next: <obligation>` or `<id>: malformed: <first error>`, then with `--all` one line `<id>: closed` per closed change, and last `closed changes: <n>`. |
| `close` | `closed: <path of close.xml>`, the path under `closed/` once moved, or `refused: <obligation>`; `not moved: <reason>` when the record was written and the move failed. |
| `init` | `created: <path>` and `exists: <path>` per entry, or `refused: change <id> exists at <path>/`. |
| `upgrade` | `up to date: <version>`; or the plan, `step: <from> -> <to>: <description>` per step and `bump: <from> -> <to>: no step for this boundary, the pin advances` per bump, then `open, untouched: <id>, <id>` when changes are open; then, unless `--plan`, per step `refreshed: <path>` per skill directory or `skills: none installed`, and `pinned: <version>` per link; `failed: <from> -> <to>: <reason>` at a failing step; after the chain `checked: <id>` per change and `upgraded: <from> -> <to>`, or `failed: post-upgrade check: <id>: <what>`; `refused: <reason>` before anything is written, the plan included. |

The reasons use fixed phrases, so a reader and a test can rely on them: `no approval for revision <n>`, `contract altered after approval`, `approval does not authorize execution`, `no brief for revision <n>`, `brief does not match the approval`, `no start run`, `working tree is dirty`, `protected path touched: <path>`, `check <id>: no result`, `check <id>: current result is <verdict>`, `check <id>: recorded on an earlier candidate`, `check <id>: recorded dirty`, `check <id>: definition changed since the result`, `no review`, `review is incomplete`, `review covers an earlier candidate`, `blocking finding <id> is open`, `no adequacy statement for check <id>`, `check <id> does not discriminate`, `rule violated: <rule>`, and for refused results `amended in unapproved revision`, `live provenance missing`, `origin is <origin>, check requires <origin>`, `device mismatch`, `build mismatch`, `identity missing`, and also `change is malformed: <error>`, `change is closed`, `a start run exists: run-<n>`, `review covers an earlier revision`, `review does not cover the complete diff`, `start revision cannot be resolved`, `blocking finding <id> is disposed without an owner decision`, `change has defects: <first defect>`, `not a git repository`, `no source revision`. A missing origin is written `origin is unattributed, check requires <origin>`.

The pin and `upgrade` add `repository state is at <pin>, kernel is <version>: run grace5 upgrade`, `repository state is at <pin>, kernel is <version>: kernel too old`, `repository pin is unreadable: <reason>`, `.grace5/ does not exist: run grace5 init` and `open changes touched by step <from> -> <to>: <id>, <id>`.

## Details settled in implementation

- The change id comes before the flags; `--check` takes one id and may be repeated. `--plan` belongs to `upgrade` only, and `upgrade` with a change id is a usage error; `--accept-evidence-loss`, the flag of 0.4.0, is a usage error on every command.
- The ids after `open changes touched by step` are the open ones the step declares, sorted. The skill refresh is reported per directory, not per file: it rewrites a file whose bytes differ from the packaged file's and removes one that is not packaged, and the paths are kernel-managed either way (`source-identity.md`).
- `failed:` lines of `upgrade` are printed on standard output like a failed result of `run`; only `refused:` goes to standard error. The post-upgrade check reads the changes with the kernel's reader, not through the `check` command, since `check` refuses the stale pin before the chain has run.
- A refusal is printed on standard error; everything else on standard output.
- A trace command that exits nonzero is `failed` before provenance is considered.
- A run whose start state is red exits 1 and is still a valid start run; a recorded observation exits 0 unless it is refused; a skip exits 0.
- `--from <file>` reads `name=value` lines with the names of the observation flags.
- A check that serves no criterion is a `defect:` of `check` and blocks nothing. Every other defect, a brief fidelity defect included, makes `close` refuse. `run` refuses on a defect of the contract or of an approval or run record at any time, and on a defect of the current revision's brief only once that revision is approved, so a draft brief of a revision awaiting approval never stops the checks the last approval still binds.
- A contract altered after approval is treated like an unapproved revision: the checks the last executing approval binds still run.
- Dirty state counts every untracked file individually (`git status --porcelain --untracked-files=all`), the kernel-managed paths excluded.
- The brief hash is over the raw bytes of the page; only the contract reads CRLF as LF.
- `Result/@log` is relative to the change directory; printed paths are relative to the root.
- `status` shows uncommitted writes to protected and outside paths as well as committed ones, and reuses the close phrases after `does not count:`.
- The move at close is a filesystem rename of the change directory; git sees it as deletions and untracked additions under `.grace5/changes/`, which are kernel-managed and not source (`source-identity.md`), and the agent commits the move with the records. An id with a directory in both locations is malformed; the open one is read.
- On Windows a run can only be interrupted by killing it, so the interrupted receipt is written on POSIX systems only; the log directory without a receipt is the record everywhere.
- Validation is by the published XSD files through xmllint; the kernel then reads the validated text with its own small XML reader, which supports elements, attributes, text and the XML declaration only. Where the two could disagree, a DOCTYPE, a CDATA section, a processing instruction or another encoding, the reader throws and the change is reported malformed, so a disagreement fails closed. Schema defaults (`required="true"`, `cwd="."`, `min="1"`, `start="false"`) and the change id pattern of `common.xsd` are restated in code and must be kept equal to the schemas by hand; `init` validates the id it is given against that copy before any schema is involved (accepted design, review finding F13 of C-0001-kernel).
