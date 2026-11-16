# Implementation notes

Prepared 2026-11-17. No approval recorded; execution has not started.

## Scope

Control-center intervention I-009 (verified change commits). This change owns the reusable commit routine, its read-back verification, the git path list, and the execute/orchestrate references to it.

## Order and dependencies

- Execute before C-0015 and C-0017 where they touch `skills/grace5-execute`.
- Execute after C-0012 where both touch `skills/grace5-orchestrate`; C-0012 owns the orchestration rewrite and this change adds only the commit citation.
- C-0018 depends on this change only for the final package regeneration.

## Implementation outline

1. Add `src/tools/change-commit.ts`: explicit `--change <id>` and explicit paths; construct the commit; append the literal `Change: <id>` trailer; read back `%(trailers:key=Change)` and `git diff-tree --name-only`; refuse empty selection, unowned paths, missing/mismatched trailer and read-back failure; never stage all dirty files.
2. Add `src/tools/change-commit.test.ts` with temporary repositories: product commit, record commit, close-move commit, empty selection, foreign dirty path, missing trailer, mismatched read-back, red test-first commit and consumed-revision protection.
3. Cite the routine in `skills/grace5-execute/SKILL.md` and `skills/grace5-orchestrate/SKILL.md`; state that batch-only ledger commits follow actual ownership.
4. Amend L-01 in `models/architecture/rationale-ledger.md`.
5. Regenerate packages; run `bun run check`, `bun test --parallel`, `bun run package:verify`, and `bun src/tools/change-commit.ts --help`.

## Verification focus

- CK2 is the decisive check: it exercises a real temporary repository and real parsed trailers.
- CK4 proves the tool has a usage surface and exits 0.
- No kernel command, record schema or receipt field is added; no history is rewritten.
