# Notes for C-0010-parallel-conformance

Never approved; sequence and technical detail only.

## Measured facts (2026-11-14, this Windows host)

- Serial full suite, clean run: 396,575 ms, recorded in C-0007's run-4 CK2 receipt (94 tests, one POSIX-only skip, zero failures, 1407 expect() calls).
- Serial full suite under concurrent load: 676 s.
- `bun test --parallel` before any rearrangement: 230 s, identical totals (93 pass, 1 skip, 0 fail, 1407 assertions). The gain is capped by the largest file: upgrade.test.ts holds 20 of the ~94 tests in one worker.
- Per-CLI-spawn cost is about 0.9 s (Bun boot, xmllint-wasm init, record validation); the suite spawns the real CLI hundreds of times. That deeper lever is out of scope here.
- conformance.md documents 57 cases; six of them (AUTH-01, AUTH-02, AUTH-04, AUTH-05, AUTH-06, REL-01) are tested by content under titles that carry no case id. The title baseline captures today's inventory as it is; renaming those titles to carry their ids is separate tidying, not this change.

## Sequence

1. `run --start` after approval.
2. Take the title baseline before touching any test file: run CK3's extraction over the current tree and write the sorted titles, one per line, to `src/conformance/test-titles.txt`. Verify CK3 passes on the untouched tree.
3. Measure per-file durations with the runner's `--timings`/`--update-timings` to confirm which files dominate.
4. Split the dominant files (upgrade.test.ts first, receipts.test.ts if it dominates after that) by topic into files of roughly even test count; move each `test(...)` block verbatim, keep the shared helper import, and give each new file a header comment naming its cases. No title, assertion or helper changes.
5. `package.json`: the `test` script becomes `bun test --parallel`.
6. AGENTS.md: the Checks line states the measured parallel duration.
7. Full evidence run (CK1, CK2, CK3), independent review, close.

## Execution details to keep

- Scratch and temporary artifacts live in the repository-local `.tmp/` (excluded through `.git/info/exclude`, outside the candidate), never in the system temp directory or outside caches.
- The split is delegated as mechanical work (AGENTS.md); the lead verifies the diff against the title baseline and commits.
- CK3's extractor regex is `test(?:\.skipIf\([^)]*\))?\(\s*"<title>"` built without literal double quotes so the command survives the Windows shell wrapper; the baseline generation must use the same extraction, not a hand-written list.
- If the post-split parallel run still exceeds half the serial baseline (A2), split further before taking final evidence; do not lower the criterion.
