# Implementation notes

Prepared 2026-11-17. No approval recorded; execution has not started.

## Scope

Control-center intervention I-008 (advisor signal and cost). This change owns the packaged advisor guidance resource, the explicit project-watchdog setup action, and the main-agent/reviewer guidance about advice relevance.

## Order and dependencies

- Execute after C-0012 and C-0013 where all three touch `skills/grace5-orchestrate` and/or `skills/grace5-execute`.
- Execute before C-0018; C-0018 must package the same resource without creating a second source.
- The `advisor.syncBacklog` trial and model/roster changes stay outside this change.

## Implementation outline

1. Move the reusable guidance into `models/architecture/advisor-guidance.md` with references that resolve in both the source and installed layouts; make the repository root `WATCHDOG.md` import it rather than duplicate it.
2. Extend `src/tools/package.ts` to include the resource in each generated distribution.
3. Add `src/tools/advisor-setup.ts`: explicit setup action that preserves existing project `WATCHDOG.md` content, adds at most one intended import, is idempotent, and writes no other project file. `--help` documents the action.
4. Add tests for fresh install, existing custom guidance, repeated setup, removed/relocated resource, and non-OMP usability.
5. Add main-agent and reviewer guidance to `skills/grace5-orchestrate/SKILL.md` and `skills/grace5-execute/SKILL.md`; amend the rationale ledger.
6. Regenerate packages; run `bun run check`, `bun test --parallel`, `bun run package:verify`, `bun src/tools/advisor-setup.ts --help`; run the CK5 replay.

## Verification focus

- Existing project guidance is byte-preserved except for the one import.
- Repeated setup changes nothing.
- A non-OMP client gains no runtime dependency.
- Advisor context is not forwarded to the independent reviewer.
