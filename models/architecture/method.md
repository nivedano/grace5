# The GRACE 5 method

GRACE 5 is a kernel for changes made by coding agents under one owner: the owner approves a short contract on an independent brief, the agent executes in isolation, evidence is recorded by receipt, an independent review covers the complete diff, and closure validates verdicts. This document is the whole method. The topic files beside it define the semantics the kernel enforces; this document cites them and does not restate them.

## Why

The measured baseline in `models/decisions/` describes GRACE 4 in use: review and device observation found most classified defects, while authored graphs, source markup and literal text assertions carried a measured maintenance stream and caught little. Those are observations with stated limits, not proof of cause. GRACE 5 is the design bet drawn from them: keep the owner-approved change with decisive evidence and independent review, ship none of the rest, and measure the result. It is written new; nothing is copied from GRACE 4. Every mechanism below has an entry in `rationale-ledger.md` with its source and its removal criterion.

## The surface

| Kind | Items |
|---|---|
| Artifacts per change | `contract.xml`, `notes.md`, `records/` under `.grace5/changes/<id>/` |
| Records | `brief-<rev>.html`, `approval-<rev>.xml`, `run-<n>.xml`, `review-<n>.xml`, `close.xml`; run logs under `records/logs/run-<n>/` |
| Commands | `grace5 init`, `check`, `run`, `status`, `close` |
| Skills | prepare, execute, review |
| Documents | this method and its topic files (`commands.md`, `authorization.md`, `brief.md`, `source-identity.md`, `trace-provenance.md`, `evidence-records.md`), the schemas in `schemas/`, the brief template in `templates/`, the worked examples in `examples/`, `conformance.md`, `rationale-ledger.md`, `retirement.md`, `m2-proposal.md` (a proposal to the measurement method, not part of the kernel), `cli-reference.md` generated from the help text |

Anything not in this table is absent: no graph, no module index, no source markup, no literal text assertions, no rule parser, no log parser beyond ordered substring matching, no migration, no daemon. The deferred proposals and their admission tests are at the end.

## The contract

A change has one id (`C-NNNN` with an optional slug, for example `C-0007-empty-export`) and one `contract.xml` (`schemas/contract.xsd`) with eight sections in fixed order.

| Section | Holds |
|---|---|
| Problem | The observed need in one to three sentences. |
| Change | What becomes true. The behavioural delta, stated once. |
| Constraints | What must hold, each optionally citing a standing project rule by path in `rule`. Rules are cited, never recopied. |
| NonGoals | What the change deliberately leaves alone. |
| Acceptance | Criteria, each naming in `checks` at least one check that serves it. The association is a declaration, never proof. |
| Affected | `Path` (paths or globs the change may write), `Name` (project-native names such as a component or a wire boundary), `Protected` (paths or globs the change must not write). |
| Checks | Optional `Environment` declarations, then the check definitions. |
| Decisions | The owner decisions made during preparation, one line each. |

The contract says what and within which boundary. It does not pre-write the code and does not list tasks; sequence, technical detail and discovered sub-steps go to `notes.md`, which is optional, mutable and never approved. Tests and test doubles of an affected file are inside the authorization without being listed.

Size is reported, never enforced. The target is 600 words of contract text and 8 checks; `check` reports both, and an excess is explained by the author and stated in the brief.

## Checks

| Kind | Definition | A pass claims |
|---|---|---|
| `Automated` | A project command, `cwd`, `budget` seconds. | The command completed with exit 0. Nothing more. |
| `Trace` | A command that produces a log, `cwd`, `budget`, ordered `Expect` markers, optional `Forbid` markers, optional `min` and `max` occurrence counts, and the `origin` it requires (`live`, `replay`, `fixture` or `any`). | The markers appeared in order in a log of the recorded origin. A replay is a replay. |
| `Manual` | A `Procedure` and the `environment` it needs. | A named person observed the stated result on the recorded build and environment. |

A check is required unless it says `required="false"`. Markers are plain substrings; the recommended project convention is `[module][function][event]`, and nothing requires or lints it. A marker that no check names is free text. Timing is limited to `budget`. Trace provenance, and how a capture command establishes live origin and device identity, is in `trace-provenance.md`. The manual observation and every other receipt field are in `evidence-records.md`.

## The lifecycle

1. Prepare. The agent interviews the owner as far as needed, writes `contract.xml`, runs `grace5 check`, then hands the contract, without the conversation, to an independent subagent. That subagent writes `records/brief-<rev>.html`, a page for the owner to read, and returns mechanical findings; the author resolves them before the owner reads anything. The brief's content and its fidelity checks are in `brief.md`.
2. Owner gate. The owner reads the brief and answers in one statement. The agent records it verbatim in `records/approval-<rev>.xml`. The statement may also authorize execution. What it binds is in `authorization.md`. No agent sets or infers an approval.
3. Execute. One change per worktree. `grace5 run --start` records the start revision, the pre-existing dirty paths (identified, never adopted) and the starting state of the automated checks, failures included (`commands.md`); a check that starts red is a recorded observation and often the reason for the change. The agent then works inside Affected, runs targeted checks with `grace5 run --check <id>`, and commits with a `Change: <id>` trailer.
4. Final evidence. At a clean source revision `grace5 run` executes every required automated and trace check, and manual observations are recorded with `grace5 run --check <id> --observe`. What counts as source, and why writing a record never forces a rerun, is in `source-identity.md`.
5. Review. An independent reviewer reads the complete diff from the start revision against the contract and the cited rules, and writes `records/review-<n>.xml`: findings, per-check adequacy, rule verdicts, and a statement of independence. A small change may be self-reviewed, and the record says so.
6. Close. `grace5 close` verifies the verdicts on the final candidate and writes `close.xml`, or refuses and names the exact unmet obligation. Which record supersedes which is in `evidence-records.md`.

`grace5 status` is the one whole-change read at any point: contract revision, authorization, actual evidence, next unresolved obligation. A malformed change is reported as malformed and never hides a valid one.

A material revision of behaviour, boundary, constraints or checks increments `revision`, gets a difference-only brief and a new approval; git preserves the previous revision. Until it is approved, only the checks whose definitions the last approval bound may run.

## Wire boundaries

When a change crosses a boundary between two components, the contract names the boundary under Affected, cites the one project-native definition or generated binding both sides use, and carries a conformance check for each side run against the same version of that definition. If an artifact is copied between repositories, the project's own provenance practice makes the copy reviewable. The framework keeps no registry of boundaries.

## Deferred, with admission tests

| Proposal | Admitted only when |
|---|---|
| Module index | A recorded pilot retrieval case where ordinary search and the project's own documents missed a required dependency or cost material time, replayed on a prototype outside the core. |
| Rule-id resolution | Recurring unresolved rule references in a pilot that a plain file link failed to fix. |
| Scenario ids tied to tests | A pilot need to report evidence per criterion beyond the declared association and beyond what trace checks give. |
| Overlap information for shared worktrees | Recorded isolation-failure events in a pilot. |
| Formal-methods pilots | Never in the schema; external and bounded only. |

Every later change to GRACE 5 is a change in its own repository whose Problem cites an explicit owner requirement, an invariant, or an observed failure, and which adds or amends one ledger entry.
