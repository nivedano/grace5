# Implementation notes

Prepared 2026-11-17. No approval recorded; execution has not started.

## Scope

Control-center intervention I-014 (verification cost). This change owns execution guidance for profiling, targeted iteration, valid build reuse and cache invalidation; pilot scripts and tests are in scope only after profiling identifies concrete work.

## Order and dependencies

- Execute after C-0013 where both touch `skills/grace5-execute`.
- Execute after C-0012 where orchestration no longer duplicates verification.
- No dependency on C-0014 or C-0015.
- C-0018 depends on this change only for the final package regeneration.

## Implementation outline

1. Add profiling and targeted-iteration guidance to `skills/grace5-execute/SKILL.md`: attribute receipt time to build, packaging, tests and live capture before adding reuse.
2. Require the complete required final set on the clean final candidate and keep focused checks for iteration.
3. Document cache-key inputs (source, toolchain, configuration, firmware variants) and invalidation tests.
4. State that a cache never supplies a receipt for different inputs, no required check is skipped and a command-semantics change returns to the owner gate.
5. Amend one rationale-ledger entry for verification cost.
6. Regenerate packages; run `bun run check`, `bun test --parallel`, `bun run package:verify`.

## Verification focus

- CK4 is the behavioural rehearsal: profile one receipt, run focused iteration and the complete final set, then (if reuse is used) exercise cold/warm, each input change and a failing selected regression.
- Cold/warm comparison on the same candidate, then change each relevant input and confirm invalidation.
- Both required firmware variants and packaging remain covered.
- An intentionally failing selected regression still fails; final evidence remains kernel-counted on the actual candidate.
- No new cache service, kernel command or receipt format.
