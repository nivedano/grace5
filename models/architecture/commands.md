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
