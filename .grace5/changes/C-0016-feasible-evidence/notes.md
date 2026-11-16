# Implementation notes

Prepared 2026-11-17. No approval recorded; execution has not started.

## Scope

Control-center intervention I-012 (feasible discriminating evidence). This change owns preparation and brief guidance only; the pilot's focused regression test and position rule are separate governed work.

## Order and dependencies

- Execute after C-0012 where both touch `skills/grace5-prepare` and `models/architecture/method.md`.
- No dependency on C-0013, C-0014, C-0015 or C-0017.
- C-0018 depends on this change only for the final package regeneration.

## Implementation outline

1. Add feasibility requirements to `skills/grace5-prepare/SKILL.md`: identify device, build/environment state and observation; use read-only diagnostics; report unknown as unknown; present one waiting-or-alternative-evidence choice before approval.
2. Add the discriminating-failure requirement to `models/architecture/brief.md`: name a plausible faulty implementation the check rejects; for a trace, name the setup whose absence also fails.
3. State in `models/architecture/method.md` that feasibility is not the final observation and authorizes no device-state change.
4. Amend one rationale-ledger entry for the preparation/brief guidance.
5. Regenerate packages; run `bun run check`, `bun test --parallel`, `bun run package:verify`.

## Verification focus

- The guidance must not make an unchanged approved check require reapproval.
- An unavailable check is not silently optionalised; the owner sees one bounded tradeoff.
- A trace check that merely lacks a marker must not pass when setup failed.
- No check kind, schema, receipt or command changes.
