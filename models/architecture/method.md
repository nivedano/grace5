# The GRACE 5 method

GRACE 5 is a kernel for changes made by coding agents under one owner: the owner approves a short contract, the agent executes in isolation, evidence is recorded by receipt, an independent review covers the complete diff, and closure validates verdicts. This document is the whole method. The topic files beside it define the semantics the kernel enforces; this document cites them and does not restate them.

## Why

The measured baseline in `models/decisions/` describes GRACE 4 in use: review and device observation found most classified defects, while authored graphs, source markup and literal text assertions carried a measured maintenance stream and caught little. Those are observations with stated limits, not proof of cause. GRACE 5 is the design bet drawn from them: keep the owner-approved change with decisive evidence and independent review, ship none of the rest, and measure the result. It is written new; nothing is copied from GRACE 4. Every mechanism below has an entry in `rationale-ledger.md` with its source and its removal criterion.

## The surface

| Kind | Items |
|---|---|
| Artifacts per change | `contract.xml`, `notes.md`, `records/` under `.grace5/changes/<id>/` while the change is open, and under `.grace5/changes/closed/<id>/` once `close` has moved it (`commands.md`) |
| Records | `approval-<rev>.xml`, `run-<n>.xml`, `review-<n>.xml`, `close.xml`; run logs under `records/logs/run-<n>/`. Historical changes also carry legacy brief pages, which the kernel reads only for a legacy approval. |
| Commands | `grace5 init`, `check`, `run`, `status`, `close`, `upgrade`; `--help` and `--version` |
| State of a repository | `.grace5/kernel-version`, the pin of the version the state conforms to, `.grace5/.gitignore`, the local ignore file that keeps the run logs out of git, and the migration steps `upgrade` composes from the pin to the kernel's version (`upgrade.md`); optional local instructions in `.grace5/extensions/` and run ledgers in `.grace5/orchestration/runs/`, neither read nor written by the kernel |
| Skills | prepare, execute, review, in `skills/`, the sole maintained skill source; the harness packages are materialized under `packages/` at build or release staging from `skills/`, are not tracked ordinary source, and are never edited |
| Tools of this repository | `src/tools/`: the package generator, the CLI reference generator, the example verifier and the historical-chain upgrade verifier (`upgrade-verify.ts`, fixed to an older release tag); `.agents/skills/grace5-release/SKILL.md`: the local release procedure, including verification from the actual previous release tag. Neither is part of the installed CLI; the local release skill is not packaged. |
| Documents | this method and its topic files (`commands.md`, `authorization.md`, `source-identity.md`, `trace-provenance.md`, `evidence-records.md`, `upgrade.md`), the reusable batch extension `extensions/orchestration.md`, the schemas in `schemas/`, the worked examples in `examples/`, `conformance.md`, `rationale-ledger.md`, `retirement.md`, `m2-proposal.md` (a proposal to the measurement method, not part of the kernel), `cli-reference.md` generated from the help text |

Anything not in this table is absent: no graph, no module index, no source markup, no literal text assertions, no rule parser, no log parser beyond ordered substring matching, no migration of GRACE 4 state, no daemon. The deferred proposals and their admission tests are at the end.

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

Size is reported, never enforced. The target is 600 words of contract text and 8 checks; `check` reports both, and an excess is explained by the author in `notes.md`.

## Checks

| Kind | Definition | A pass claims |
|---|---|---|
| `Automated` | A project command, `cwd`, `budget` seconds. | The command completed with exit 0. Nothing more. |
| `Trace` | A command that produces a log, `cwd`, `budget`, ordered `Expect` markers, optional `Forbid` markers, optional `min` and `max` occurrence counts, and the `origin` it requires (`live`, `replay`, `fixture` or `any`). | The markers appeared in order in a log of the recorded origin. A replay is a replay. |
| `Manual` | A `Procedure` and the `environment` it needs. | The operator observed the stated result on the recorded build and environment. |

A check is required unless it says `required="false"`. Markers are plain substrings; the recommended project convention is `[module][function][event]`, and nothing requires or lints it. A marker that no check names is free text. Timing is limited to `budget`. Trace provenance, and how a capture command establishes live origin and device identity, is in `trace-provenance.md`. The manual observation and every other receipt field are in `evidence-records.md`.

## The lifecycle

1. Prepare. Triage by risk before opening a change: a chore whose worst outcome is visible and reversible with the project's own commands — a minor skill-text correction, a small CLI bug fix — is edited directly, without a specification and without asking; risk that outruns what a direct edit can tackle opens a full change, and an explicit request for a specification always gets one. A direct edit is an ordinary source edit outside this lifecycle, verified with the project's own commands. For a prepared change, the agent interviews the owner as far as needed, writes `contract.xml`, runs `grace5 check`, then hands the contract, without the conversation, to an independent subagent that did not write it. That subagent receives the contract, the cited rule files and read access to the repository, and returns findings only: a criterion its check cannot serve, an undefined term, a contradiction, a boundary that does not cover Change, a cited path that does not exist. The author resolves each finding by editing the contract before the owner gate. This independent contract read is the whole pre-approval independence; no page and no fidelity parser is produced. A material revision repeats that preparation in the conversation that requested it: the revision, its contract edit, `grace5 check` and the owner gate are one phase, not a separate session, only the unresolved owner decision is put to the owner, and an approval of the exact unchanged revision is reused rather than re-requested. Preparation also establishes that every required check can produce its observation: it identifies the check's device, build and environment state and observation, uses the available read-only diagnostics, reports what it cannot establish as unknown, and, when required evidence is unavailable, puts one bounded choice to the owner — wait for the evidence, or accept alternative evidence with its stated limitation. Feasibility is a preparation obligation, not evidence: it authorizes no flashing, reset or other device-state change, is never recorded as a check's result, and relaxes no scheduling rule, so a change that shares a bookkeeping or affected path with a parked change stays parked as dependent (the batch extension).
2. Owner gate. The owner reads the contract and answers in one statement. The agent records the decision in `records/approval-<rev>.xml`: `approved`, or the reason for a rejection. New records omit personal attribution, quotes and `Source`; legacy attribution fields are ignored. An approval authorizes execution. What it binds is in `authorization.md`. No agent sets or infers an approval.
3. Execute. Standalone execution uses one change per worktree. A serial orchestrated batch may retain parked changes in its current worktree with one active implementer; this is an explicit exception to the standalone rule, not concurrent execution. Every change retains its original start revision and complete start-to-final diff, including later changes' commits; no source path is filtered out, every source commit invalidates earlier evidence, and Protected paths still apply (`source-identity.md`). `grace5 run --start` records the start revision, the pre-existing dirty paths (identified, never adopted) and the starting state of the automated checks, failures included (`commands.md`); a check that starts red is a recorded observation and often the reason for the change. The agent then works inside Affected, runs targeted checks with `grace5 run --check <id>`, and commits with a `Change: <id>` trailer.
4. Final evidence. At a clean source revision `grace5 run` executes every required automated and trace check, and manual observations are recorded with `grace5 run --check <id> --observe`. Targeted iteration and valid build reuse are allowed only under the profiling, cache-key and invalidation rules of `grace5-execute`, and final evidence remains the complete required set, kernel-counted on the clean candidate. What counts as source, and why writing a record never forces a rerun, is in `source-identity.md`.
5. Review. An independent reviewer reads the complete diff from the start revision against the contract and the cited rules, and writes `records/review-<n>.xml`: findings, per-check adequacy, rule verdicts, and a statement of independence. A small change may be self-reviewed, and the record says so.
6. Close. `grace5 close` verifies the verdicts on the final candidate and writes `close.xml`, or refuses and names the exact unmet obligation; then it moves the change directory under `.grace5/changes/closed/`, so the open changes stay in view. Which record supersedes which is in `evidence-records.md`.

`grace5 status` is the one whole-change read at any point: contract revision, authorization, actual evidence, next unresolved obligation. Without an id it lists the open changes and counts the closed ones. A malformed change is reported as malformed and never hides a valid one. Its first line names the kernel's version and the pin of the state, and every other command refuses state pinned to another version until `grace5 upgrade` has brought it to the kernel's (`upgrade.md`).

## Releases

A release is a separate explicitly owner-requested framework tooling act, outside the change lifecycle (`upgrade.md`). It carries closed changes, moves the version, README status line and pin, registers the migration boundary if needed, regenerates packages, verifies the mechanical checks and an upgrade from the previous tag, and commits a release record before tagging the clean commit. Until then ordinary changes carry the last release's version; they may prepare migration implementation and tests but register no future boundary or versioned table row. The repository-local `.agents/skills/grace5-release/SKILL.md` performs the act and is not shipped; change approvals authorize no release.

A material revision of behaviour, boundary, constraints or checks increments `revision`, gets a new approval; git preserves the previous revision. Until it is approved, only the checks whose definitions the last approval bound may run.

## Local extensions

A repository may keep optional Markdown instruction files directly under `.grace5/extensions/`, one topic per file. Each new extension starts with this four-line YAML header; `roles` is a single-line list and `when` is one sentence describing the task that activates the body.

```yaml
---
roles: [coordinator]
when: Run or resume a batch of approved GRACE 5 changes.
---
```

Roles are `coordinator` (batch scheduling), `preparer` (contract author), `contract-reader` (independent pre-approval read), `implementer` (execution), and `reviewer` (final review). Use `[all]` for shared instructions. Match complete role names; a parent dispatch does not make its worker a coordinator.

At entry and on a role change, list the local `*.md` files and inspect only their first four lines. Load a body only when `roles` contains the current role or `all` and `when` applies to the current task. Read each selected body once per session and reread it if the file changes. An absent directory means no local extensions. Existing files without this header retain their prose role declarations: read those files once to determine applicability, then add headers during their next authorized edit. An incomplete or invalid header is reported and read as legacy prose, so an instruction is never silently discarded.

For example, PowerShell can inventory headers without loading bodies into context:

```powershell
Get-ChildItem -LiteralPath .grace5/extensions -Filter *.md -File | ForEach-Object { $_.Name; Get-Content -LiteralPath $_.FullName -TotalCount 4 }
```

An extension may replace a skill's default and grant standing authority for outward-facing actions; it cannot grant an approval, an observation, an owner disposition or another gate the kernel reserves (`authorization.md`, `evidence-records.md`). The kernel never creates, reads, writes or validates extensions. Discovery is an agent instruction, with no parser or registry.

`extensions/orchestration.md` beside this method is the reusable batch policy, shipped in each distribution at `extensions/orchestration.md`. Install it in the client's `.grace5/extensions/` to activate it for coordinators. In this repository the local extension points to that maintained source. The coordinator delegates each phase to its lifecycle skill and workers discover their own applicable extensions. Optional recovery checkpoints under `.grace5/orchestration/runs/` contain only information unavailable from kernel records and harness state. Both local directories remain outside the candidate (`source-identity.md`).

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

Every later change to GRACE 5 is a change in its own repository whose Problem cites an explicit owner requirement, an invariant, or an observed failure, and which adds or amends one ledger entry. A change that needs nontrivial migration of state layout, local ignore requirements, stored records or skill installations prepares the implementation and tests before release; the release registers its boundary and versioned table row (`upgrade.md`). Skill-content-only releases may register a refresh-only step using the runner's existing refresh.
