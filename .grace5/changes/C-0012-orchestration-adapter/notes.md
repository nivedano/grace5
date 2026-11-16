# Implementation notes

Prepared 2026-11-17. No approval recorded; execution has not started.

## Scope

Control-center interventions I-007 (harness-native orchestration) and I-011 (bounded worker orientation), grouped because their dispatch packets and role boundaries share one rehearsal surface. This change owns the orchestration adapter, the same-conversation preparation handoff, the compact portable checkpoint, bounded role packets and the installed documentation-root line in `grace5 --help`.

## Order and dependencies

- No dependency on another prepared change.
- Execute before C-0013, C-0015, C-0016 and C-0017 where they touch `skills/grace5-orchestrate` or `skills/grace5-prepare`.
- C-0018 depends on this change only for the final package regeneration.

## Implementation outline

1. Rewrite `skills/grace5-orchestrate/SKILL.md` around the responsibility table: harness task facilities own spawn/message/wait/cancel/inspect/progress; the adapter owns selection, isolation, phase and closure.
2. Replace forced fan-out, coordinator-run verification and duplicate todo/ledger phases with one active implementer in a shared worktree, implementer-run evidence, coordinator validation of status and the complete diff, and one compact `.grace5/orchestration/runs/` checkpoint.
3. Rewrite the preparation handoff in `skills/grace5-prepare/SKILL.md` as a lifecycle phase in the same conversation; keep the exact-revision owner gate and approval reuse.
4. Add bounded dispatch/reviewer packet contents and the non-OMP capability fallback, including a pre-dispatch critical stop for a conflicting higher-priority harness policy.
5. Add `documentation root: <path>` to `src/cli.ts` help, resolved from the installed layout; update `models/architecture/commands.md`; regenerate `models/architecture/cli-reference.md` and `packages/`.
6. Amend L-24 in `models/architecture/rationale-ledger.md` with the reduced adapter/checkpoint cost, P-014 failure, smallest alternative and removal criterion.
7. Run `bun run check`, `bun test --parallel`, `bun run package:verify`; run the CK5 rehearsal in an OMP session and one non-OMP task path; record the observation.

## Verification focus

- The help trace must find `documentation root:` in `bun src/cli.ts --help`.
- The manual rehearsal is the only evidence for behaviour: at most one implementer, same-conversation revision preparation, approval reuse, honest red baseline, reviewer packet without authoring context, recovery without duplicate start, and a pre-dispatch conflict stop.
- No kernel command, schema, receipt, approval rule, migration row or release identity changes.
