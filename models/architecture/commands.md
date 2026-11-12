# Commands

What each of the five commands does, to the level an implementer needs. The reference of flags, `cli-reference.md`, is generated from the help text; this file states behaviour. Every command takes the change id, or finds the single change directory when only one is open. Exit status is 0 on success and nonzero when the command refuses or finds a defect; a refusal names the unmet obligation on one line.

## init

Creates `.grace5/changes/` and `.grace5/README.md`, a short entry point that links the project documents and rule files it finds (README, AGENTS.md, CLAUDE.md, docs and models directories). It overwrites nothing: an existing file is reported and left alone. With a change id it also creates that change directory with a contract template.

## check

Validates and executes nothing. For the selected change:

1. `contract.xml` validates against `schemas/contract.xsd`.
2. Every id in a Criterion's `checks` names a check element; every `environment` names an Environment; every check serves at least one criterion or is reported as unused.
3. Every `rule` path, without its `#fragment`, exists in the repository. Paths under Affected are not required to exist.
4. Protected globs are well formed, and no `Path` is wholly covered by a `Protected`.
5. Every XML record present validates against its schema and names this change.
6. Every brief passes the mechanical fidelity rules of `brief.md`, against the contract text whose hash it carries when that is the current text.
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

Reads everything and changes nothing. For the selected change it reports: the contract revision and whether it is valid; the authorization state (unapproved, approved, approved for execution, rejected, altered after approval); the start revision; the current candidate and whether the tree is dirty; changed files outside `Path` and any inside `Protected`; per check the current result, whether it is on the current candidate, and whether it would count at close; the current review and its open findings; runs that were interrupted; and one line naming the next unresolved obligation, which is the first step `close` would refuse at.

Without a change id it lists every change with one line each. A change that fails validation is listed as malformed with its first error, and the others are reported normally. The gate is strict: `close` and `run` refuse a malformed change; `status` only describes it.

## close

Applies the eight steps of `evidence-records.md` and writes `close.xml`, or refuses at the first unmet step. A closed change refuses further runs.

## Output conventions

Output is plain text, one fact per line, stable enough to grep. The invocation is `grace5 [--root <dir>] <command> [change] [flags]`; `--root` defaults to the current directory. Exit status is 0 on success, 1 on a refusal, a defect or a run in which any executed check did not pass, and 2 on a usage error.

| Command | Lines |
|---|---|
| `check` | `contract-sha256: <hash>`, `definition <id>: <hash>` per check, `words: <n> (target 600)`, `checks: <n> (target 8)`, and `defect: <text>` per defect. A brief defect names the file and the omitted item, for example `defect: brief-1.html: protected path src/x/** is missing`. |
| `run` | `run <n>: <check> <verdict>` per result with the reason after a colon when there is one, then `receipt: <path>`. A refused invocation prints `refused: <reason>` and writes no receipt. |
| `status` | `change:`, `revision:`, `authorization:` (`unapproved`, `approved`, `approved for execution`, `rejected` or `altered after approval`), `start:`, `candidate: <hash> (clean)` or `(dirty)`, `outside: <path>` and `protected: <path>` per file, `check <id>: <verdict>` followed by `, counts` or `, does not count: <reason>`, `review:`, `interrupted: run-<n>`, `closed:` when closed, and last `next: <obligation>`. In the listing, one line per change: `<id>: <authorization>, next: <obligation>` or `<id>: malformed: <first error>`. |
| `close` | `closed: <path of close.xml>`, or `refused: <obligation>`. |

The reasons use fixed phrases, so a reader and a test can rely on them: `no approval for revision <n>`, `contract altered after approval`, `approval does not authorize execution`, `no brief for revision <n>`, `brief does not match the approval`, `no start run`, `working tree is dirty`, `protected path touched: <path>`, `check <id>: no result`, `check <id>: current result is <verdict>`, `check <id>: recorded on an earlier candidate`, `check <id>: recorded dirty`, `check <id>: definition changed since the result`, `no review`, `review is incomplete`, `review covers an earlier candidate`, `blocking finding <id> is open`, `no adequacy statement for check <id>`, `check <id> does not discriminate`, `rule violated: <rule>`, and for refused results `amended in unapproved revision`, `live provenance missing`, `origin is <origin>, check requires <origin>`, `device mismatch`, `build mismatch`, `identity missing`, and also `change is malformed: <error>`, `change is closed`, `a start run exists: run-<n>`, `review covers an earlier revision`, `review does not cover the complete diff`, `start revision cannot be resolved`, `blocking finding <id> is disposed without an owner decision`, `change has defects: <first defect>`, `not a git repository`, `no source revision`. A missing origin is written `origin is unattributed, check requires <origin>`.

## Details settled in implementation

- The change id comes before the flags; `--check` takes one id and may be repeated.
- A refusal is printed on standard error; everything else on standard output.
- A trace command that exits nonzero is `failed` before provenance is considered.
- A run whose start state is red exits 1 and is still a valid start run; a recorded observation exits 0 unless it is refused; a skip exits 0.
- `--from <file>` reads `name=value` lines with the names of the observation flags.
- A check that serves no criterion is a `defect:` of `check` and blocks nothing. Every other defect, a brief fidelity defect included, makes `run` and `close` refuse.
- A contract altered after approval is treated like an unapproved revision: the checks the last executing approval binds still run.
- Dirty state counts every untracked file individually (`git status --porcelain --untracked-files=all`).
- The brief hash is over the raw bytes of the page; only the contract reads CRLF as LF.
- `Result/@log` is relative to the change directory; printed paths are relative to the root.
- `status` shows uncommitted writes to protected and outside paths as well as committed ones, and reuses the close phrases after `does not count:`.
- On Windows a run can only be interrupted by killing it, so the interrupted receipt is written on POSIX systems only; the log directory without a receipt is the record everywhere.
