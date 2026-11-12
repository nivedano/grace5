# FABLE support file: measurements behind the Round 1 claims

Author: FABLE. Round: 1 (support). Revision: v1. Date: 2026-11-12.
This file is evidence, not a vote. Every number below was produced by the command shown, on 2026-11-11/12, against the checkouts named. Re-run to re-check.

Sources:

Project labels: FW is a C firmware project (ESP-IDF, FreeRTOS, device-tested, with a Python CLI); CS is a C# desktop and cloud project; TS is a TypeScript Electron project with a large automated test suite; PY is a Python and TypeScript project. control-center is the private repository that holds the measurement method, backlog, interventions and snapshots. Real names are withheld.

- Framework fork: the GRACE 4 fork repository (HEAD d940ecc, 2026-11-09).
- Governed repos: the four governed repositories FW, CS, TS and PY.
- Baseline snapshot: `control-center/grace/optimize/snapshots/S-001-2026-11-08/` (`metrics.json`, `defects.jsonl`, `summary.md`); raw transcript archive in git-ignored `control-center/grace/optimize/state/snapshots/S-001/raw/` (Claude Code and Codex, window 2026-10-06 to 2026-11-08).
- Method: `control-center/grace/optimize/METHOD.md` (M1). Backlog: `control-center/grace/optimize/backlog.md`. Interventions: `control-center/grace/optimize/interventions/I-00[1-6]-*.md`.
- Counting scripts: `<scratch>/count.py`, `<scratch>/skills.py` (outside any repo; copies can be requested).

## S1. Skill text and CLI size over releases (grace-marketplace)

Command: for each ref, sum of bytes of `skills/grace/**/*.{md,xml}` from `git ls-tree`, and lines of non-test `src/**/*.ts`.

| ref | date | skill text bytes | CLI source lines |
|---|---|---|---|
| v4.0.0-rc.0 | 2026-06-21 | 50,842 | 4,804 |
| v4.2.1 | 2026-09-24 | 66,316 | 8,845 |
| HEAD (fork) | 2026-11-09 | 115,098 | 11,385 |

SKILL.md sizes at HEAD (bytes): grace-cli 14,929; grace-brief 7,522; grace-execute 7,202; grace-verification 6,329; grace-plan 5,937; grace-spec 4,392; grace-reviewer 3,667; grace-init 3,172; grace-migrate 2,824; grace-status 2,524; grace-explainer 1,753; grace-setup-subagents 1,335; grace-refresh 1,153; grace-ask 1,026; grace-refactor 903; grace-fix 786. References: 44,356 bytes.

## S2. Artifact sizes in the governed repos (working tree, 2026-11-11)

Command: `find .grace/changes/archive -name spec.xml|plan.xml|design-context.xml -exec wc -l`, sorted; `.grace` totals by `cat`.

| repo | archived changes | spec lines min/median/max | plan lines min/median/max | design-context median | graph lines | verification lines | context lines |
|---|---|---|---|---|---|---|---|
| FW | 28 | 50 / 96 / 528 | 72 / 312 / 517 | 36 | 1,195 | 2,404 | 835 |
| CS | 39 | 44 / 61 / 218 | 82 / 196 / 432 | 22 | 131 | 155 | 55 |
| TS | 35 | 64 / 93 / 117 | 253 / 604 / 997 | 30 | 174 | 671 | 64 |
| PY | 39 | 43 / 78 / 112 | 43 / 148 / 368 | 31 | 109 | 111 | 73 |

Largest plan, `TS/.grace/changes/archive/C-LARGEST-TS-PLAN/plan.xml` (997 lines), lines per top-level section: ImplementationPlan 345, TargetAssertions 321, BaselineAssertions 252, ObservedWriteScope 60, DurableScope 16, IntentSummary 1. It holds 15 tasks and 118 MustContain/MustNotContain/MustExist/MustVerify/MustPassCommand elements.

Literal text assertions across all archived plans (`grep -c '<(MustContain|MustNotContain)>'` per plan):

| repo | median per plan | max | total | tasks per plan avg | File+Glob scope entries per plan avg |
|---|---|---|---|---|---|
| FW | 14 | 25 | 372 | 8.8 | 41.3 |
| CS | 4 | 37 | 322 | 5.9 | 39.1 |
| TS | 55 | 114 | 1,931 | 12.7 | 89.1 |
| PY | 0 | 0 | 0 | 5.5 | 19.5 |

Lint failures of those assertions in the S-001 window (`metrics.json` -> `lint_errors`): `assertion.MustContain` FW 1, TS 2, CS 0.

## S3. Prose density of graph and verification documents

Command: regex over `<Summary>` and `<Scenario>` bodies, word counts.

| repo | graph `<Summary>` count / median words / max words / total | verification `<Scenario>` count / median / max / total |
|---|---|---|
| FW | 25 / 359 / 1,988 / 15,610 | 438 / 57 / 306 / 30,804 |
| CS | 16 / 32 / 173 / 754 | 13 / 61 / 498 / 1,839 |
| TS | 20 / 266 / 4,618 / 14,585 | 252 / 136 / 1,211 / 45,648 |
| PY | 14 / 59 / 238 / 952 | 14 / 79 / 842 / 3,576 |

Example of device-observation prose inside a scenario: `FW/.grace/verification/firmware.xml`, `V-M-FW-CORE`, third `<Scenario>` ("Watched on a named test drone with the console tapped: the timeout fires and is confirmed at tick 671525 ...").

## S4. File-local markup share of source

Command: `git ls-files` by extension, `grep -l START_MODULE_CONTRACT`, and a line-regex for marker/field lines.

| repo | source files | governed (have MODULE_CONTRACT) | source lines | markup lines | share |
|---|---|---|---|---|---|
| FW (c/h/py) | 472 | 46 | 270,492 | 2,627 | 1.0% |
| CS (cs) | 1,604 | 304 | 340,597 | 9,099 | 2.7% |
| TS (ts/tsx) | 578 | 479 | 147,251 | 23,942 | 16.3% |
| PY (py/ts) | 729 | 1 | 238,732 | 8 | 0.0% |

## S5. Lines churned over the whole git history, `.grace/` against product code

Command: `git log --numstat --format=`, summed by path class (`.grace/` vs code extensions vs other).

| repo | `.grace` lines churned | code lines churned | ratio |
|---|---|---|---|
| FW | 21,643 | 297,922 | 0.07 |
| CS | 13,259 | 366,052 | 0.04 |
| TS | 30,329 | 233,320 | 0.13 |
| PY | 12,030 | 317,924 | 0.04 |

## S6. Lifecycle wall-clock per archived change (git)

Command: for each archived `C-*`, time from the commit that added `.grace/changes/active/C-*/spec.xml` to the commit that added `.grace/changes/archive/C-*/spec.xml`.

| repo | hours min / median / p75 / max | n |
|---|---|---|
| FW | 0 / 6 / 34 / 275 | 25 |
| CS | 1 / 9 / 30 / 44 | 38 |
| TS | 1 / 21 / 40 / 101 | 35 |
| PY | 0 / 2 / 57 / 206 | 38 |

Caveat: wall-clock includes idle time and overlapping changes; orientation only.

## S7. S-001 activity (from `snapshots/S-001-2026-11-08/metrics.json`)

| | FW | TS | CS |
|---|---|---|---|
| archived changes | 8 | 22 | 11 |
| tool calls | 8,967 | 41,732 | 9,457 |
| tool calls per archived change | 1,121 | 1,897 | 860 |
| grace CLI calls + `.grace` edits | 551 (6.1%) | 3,045 (7.3%) | 198 (2.1%) |
| owner messages per archived change | 18 | 14 | 15 |
| gate median / p90 seconds | 418 / 487 | 433 / 2,905 | 54 / 98 |

Top lint codes in the window (totals): `markup.module-map-mismatch` 92, `markup.mismatched-marker` 28, `markup.overlapping-markers` 27, `markup.role-map-mode-mismatch` 16, `assertion.change-not-approved` 15, `projection.verification.invalid-test-file` 15.

## S8. Defects by class and first-detection channel (`defects.jsonl`, 210 records)

| class | review | device | gate | grace | owner | later | self | total |
|---|---|---|---|---|---|---|---|---|
| a unit condition | 52 | 9 | 7 | 0 | 2 | 3 | 3 | 76 |
| b requirement | 3 | 4 | 0 | 0 | 4 | 1 | 0 | 12 |
| c cross-module / wire | 12 | 3 | 5 | 0 | 3 | 0 | 0 | 23 |
| d concurrency / ordering | 13 | 9 | 3 | 0 | 0 | 0 | 2 | 27 |
| e environment | 2 | 5 | 4 | 0 | 0 | 1 | 1 | 13 |
| f GRACE artifacts / process | 27 | 0 | 3 | 7 | 0 | 1 | 0 | 38 |
| g other | 11 | 3 | 6 | 0 | 0 | 0 | 1 | 21 |
| total | 120 | 33 | 28 | 7 | 9 | 6 | 7 | 210 |

All 7 defects first found by the `grace` channel are class `f`. Their ids: 0ac91e9df14b-1, 6aa904b45dc5-1, 99e366753de0-1, c30b9012d411-1, d5e31b6603d2-1, fd38ad369ab6-1, fd38ad369ab6-2.

## S9. GRACE command and artifact usage in the Claude Code transcripts of S-001

Command: `<scratch>/count.py` over the raw archive: walks every `tool_use` block (64,120 blocks; `$dup` lines skipped), matches `grace <subcommand>` in Bash commands and `.grace/<segment>` in file paths. Codex rollouts encode tool calls differently and are not counted here.

| grace subcommand | calls |
|---|---|
| lint | 2,003 |
| file show | 1,206 |
| status | 540 |
| module show | 30 |
| module health | 6 |
| verification show | 5 |
| module find / verification find / archive | 0 |

| tool x `.grace/` segment | calls |
|---|---|
| Edit changes | 1,739 |
| Read changes | 1,073 |
| Grep changes | 369 |
| Edit verification | 132 |
| Write changes | 110 |
| Read verification | 48 |
| Edit graph | 47 |
| Read graph | 28 |
| Edit context | 20 |
| Read context | 4 |

## S10. Skill invocations in the same transcripts

Command: `<scratch>/skills.py`: `Skill` tool calls by skill name, `<command-name>` slash commands, and `grace-*` names inside `Agent`/`Task` prompts.

| skill | Skill-tool invocations (`grace:` and bare names summed) | named in subagent prompts |
|---|---|---|
| grace-spec | 21 | 24 |
| grace-plan | 21 | 26 |
| grace-execute | 9 (+1 slash) | 5 |
| grace-verification | 6 | 13 |
| grace-reviewer | 5 | 35 |
| grace-refactor | 1 | 0 |
| grace-cli | 0 | 3 |
| grace-ask, grace-fix, grace-refresh, grace-migrate, grace-setup-subagents, grace-explainer, grace-status, grace-init | 0 | 0 |

grace-brief did not exist in the window.

## S11. Project-side registries outside `.grace`

- `FW/.grace/context/principles.xml`, fourth `<Principle>`: "Deep registries are cited by id, never copied. The design-rule packs, models/architecture/index.yaml and models/specs remain the single source of truth ... tools/lint_grace_refs.py enforces this by failing any unresolved id." Its `<DesignRules>` names DR-APP-1..3, DR-FW-1..13, DR-PY-1..4.
- `TS`: `DR-TS-*` rules referenced from `.agents/agents/grace-reviewer.md`, `.agents/agents/grace-worker.md`, and archived specs/plans (`grep -rl DR-TS`).
- `FW/models/`: `architecture`, `design-rules`, `process-rules`, `specs`.

## S12. Backlog and interventions already recorded (control-center)

P-001 committed out-of-scope edits (I-001, shipped in fork), P-002 scenarios without evidence (I-002), P-004 wire contracts (I-003), P-005 scope inflation, P-006 gate duration, P-007 artifact errors share, P-008 approval semantics, P-010 lint noise, P-011 in-place widening (I-001, I-005), P-012 approval on unread artifacts (I-006 grace-brief), P-013 mechanical audit checks not linted.
