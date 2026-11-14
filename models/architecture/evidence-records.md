# Evidence records

The run receipt, the manual observation, the review and close records, which record supersedes which, and what `close` verifies. Schemas are in `schemas/`.

## The run receipt

One `run` invocation writes one `records/run-<n>.xml` and never edits it. The run reserves `records/logs/run-<n>/` first and writes each check's log there. The receipt holds each log's hash; logs can be large and can contain machine-local paths, so whether they are committed is the project's choice, and this repository ignores them.

| Field | Where | Meaning |
|---|---|---|
| Exact definition | `Result/Definition`, `definition-sha256` | The canonical text of the check as run, and its hash. |
| Working directory | `Result/@cwd` | Relative to the repository root. |
| Result | `Result/@verdict`, `@exit`, `@claim` | The verdict, the exit code, and what a pass claims. |
| Elapsed time | `Result/@elapsed-ms` | Wall clock of the command. |
| Log location | `Result/@log`, `@log-sha256` | Path of the captured log and its hash. |
| Source revision and dirty state | `Run/@source-revision`, `@dirty`, `@candidate` | `source-identity.md`. |
| Declared environment identity | `Result/@environment` | Copied from the Environment the check names. |
| Trace provenance | `Result/Trace` | `trace-provenance.md`. |
| Manual observation | `Result/Observation` | Below. |

The canonical definition text of a check is its fields, one per line as `name=value`, lines ended by a line feed, in this order: `kind` (lower case), `id`, `required`, `cwd`, `budget`, `origin`, `log`, `environment`, `command`, one `expect` line per Expect, one `forbid` line per Forbid, `procedure`. Schema defaults are written out (`required=true`, `cwd=.`); a field the check kind does not have, or an optional one left out, has no line. The `environment` value is the Environment's id, device, build and text joined by `|`, an absent part left empty. An `expect` value is `min,max|marker` with `max` empty when unbounded, for example `expect=1,|All components initialized`. Whitespace inside values is collapsed. The hash is SHA-256 of that UTF-8 text.

## Verdicts

| Verdict | Meaning | Closes |
|---|---|---|
| `passed` | Automated: exit 0. Trace: sequence found with acceptable provenance. Manual: the operator recorded a pass. | Yes, when bound to the final candidate. |
| `failed` | Nonzero exit, a missing or forbidden marker, or an observed failure. | No |
| `blocked` | Manual: the procedure could not be carried out. | No |
| `cancelled` | The budget ran out or the operator stopped the command. | No |
| `interrupted` | The run died while this check was running. | No |
| `not-attempted` | Selected, never started. | No |
| `skipped` | Deliberately left out with a recorded reason. | No |
| `refused` | Not authorized, or provenance missing or mismatched. | No |

A pass claims only what `claim` says: `command-completion`, a `marker-sequence-*` of the recorded origin, or `observation`. A command that exits 0 without exercising the criterion is a completed command; whether a check discriminates the intended behaviour from its failure is the reviewer's `Adequacy` statement, not the receipt's.

A run stopped by a signal writes its receipt with `status="interrupted"`, the running check `interrupted` and the rest `not-attempted`. A run killed outright leaves a log directory without a receipt; `status` reports that run as interrupted.

## The manual observation

A manual check is satisfied only by a recorded observation, never by its procedure. The operator, or an agent recording what a named person reported, runs:

`grace5 run <change> --check <id> --observe <passed|failed|blocked|not-attempted> --by <who> --build <build identity> [--environment <text>] [--reference <photo, log or note>] --note <what was seen>`

or gives the same fields in a file with `--from`. The receipt records the observation with who, when, build and environment, inside a run that carries the candidate and a result that carries the check definition hash. So the observation is bound to candidate, build, environment and check definition. If the check's Environment declares a build, the stated build must satisfy it by the rule of `trace-provenance.md`; otherwise the result is `refused`. A declared device is recorded with the environment and is not compared: the operator's statement is the evidence, and the kernel does not pretend to verify it.

## Supersession

| Event | Rule |
|---|---|
| A check is rerun | For each check, the result in the highest-numbered run that contains it is the current one. A later failure supersedes an earlier pass; an earlier pass is never picked over it. A run that does not contain the check does not touch it. |
| The candidate changes | Every result recorded on another candidate, manual observations included, is history. Nothing carries over. |
| A check definition changes in a new approved revision | Results with the old definition hash are history for that check only. |
| A revision is approved | The brief and approval of the contract's current revision number are current. Records of other revisions stay and bind nothing. |
| A review is repeated | The highest-numbered `review-<n>.xml` is current. It must cover the complete diff to the final revision and name the final candidate; a review of an earlier candidate is history. |
| A finding is resolved by a code change | The candidate changed, so a new review pass and fresh final evidence are due. |
| A record is committed | Nothing is superseded; the candidate is unchanged. |

No record is deleted or rewritten to supersede it. Git and the numbering hold the history.

## The review record

`records/review-<n>.xml` states who reviewed and how independent they were, the diff covered (`start-revision` to `end-revision`) and its candidate, findings with severity and status, an `Adequacy` statement per check, and a verdict per cited rule. A blocking finding is `open`, `resolved`, or `owner-disposed` with the owner's quoted `OwnerDecision`. A violated rule or a check that does not discriminate is also written as a blocking finding. Whether a change is small enough for its author to review is the author's judgement, visible in the record as `independence="self"` and counted by measurement.

## What close verifies

`grace5 close` checks these in order and refuses at the first unmet one, naming it.

1. `check` reports no defect in the contract or in an approval, run or review record; then the contract's hash equals the hash in the current revision's approval, and that approval is `approved` and binds every check; then `check` reports no defect in the current revision's brief.
2. A brief exists for the current revision with the same contract hash, and its own hash equals the approval's `brief-sha256`.
3. A start run exists and its source revision can be resolved in the repository.
4. The working tree has no dirty source path.
5. The complete diff from the start revision touches no protected path.
6. For every required automated and trace check: the current result is `passed`, clean, on the final candidate, with the current definition hash.
7. For every required manual check: the current result is a `passed` observation, recorded clean on the final candidate with the current definition hash, a build and an environment.
8. The current review is `completed`; carries the current contract hash; covers the complete diff, its `start-revision` being the start run's revision and its `end-revision` a commit that carries the final candidate; has no blocking finding that is `open` or that is `owner-disposed` without the owner's quoted decision, has an `Adequacy` with `discriminates="true"` for every required check, and has no `Rule` with verdict `violated`.

Then it writes `close.xml` naming the run that satisfied each check. Checks marked `required="false"` are listed with their latest verdict and never counted.

## What closed means

A change is closed when `records/close.xml` exists; the eight steps above are what `close` verifies before writing it, not what the kernel verifies afterwards. The kernel authenticates no record: every record is agent-writable, and a schema-valid `close.xml` written by hand makes `status` and the listing report the change as closed, with the kernel comparing the record against nothing. What the file names, the candidate, the review and the satisfying runs, is there for a reader and for measurement to compare with the other records and with git; `status` does not do that comparison. Records are therefore committed, so that git holds who wrote what and when, and review and measurement, not the kernel, are where a close record that does not match its evidence is caught (accepted design, review finding F9 of C-0001-kernel).

Once `close.xml` is written, `close` moves the whole change directory to `.grace5/changes/closed/<id>/` as a ninth step; the records keep their paths relative to the change directory, so nothing in them is rewritten and the moved change validates unchanged. The move is never a closing condition: the change is closed by the record, whether the move happened or not. A directory under `closed/` without `records/close.xml` is malformed, so deleting `close.xml` reopens only a change that was not moved; under `closed/` it leaves a malformed directory, and nothing moves a change back (`commands.md`).
