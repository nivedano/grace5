# Implementation notes

Prepared 2026-11-17. No brief is written, per the requested retirement. No approval is recorded; execution has not started.

## Bootstrap limitation

The current kernel requires a brief for a new approval: `approval.xsd` requires `brief-sha256`, and `state.obligation` and `close` require a brief for the current revision. This change removes that requirement, but it cannot itself be approved under the old rule without a brief. Two owner paths are possible and neither is inferred here:

1. Authorize one last brief for this change only, approving the retirement; or
2. Record an explicit one-time bootstrap decision outside the normal brief flow, with the exact contract and check hashes, and treat the implementation as the first application of the new rule.

Until one is chosen, `grace5 status C-0019-retire-briefs` reports `unapproved` and no execution may start. A brief was deliberately not created.

## Scope

- Remove the brief from the approval surface: new approval records bind the contract and check definitions only.
- Keep legacy briefs, approvals and close records readable; validate a brief only when the approval carries `brief-sha256`.
- Remove the active brief documents/template and the brief writer/handoff guidance.
- Keep checks, receipts, independent complete-diff review, protected paths and closure unchanged.

## Implementation outline

1. `models/architecture/schemas/approval.xsd`: make `brief-sha256` optional; comment that it is legacy. `close.xsd`: make `brief` optional. Keep every other attribute and element.
2. `src/records.ts`: make the approval brief hash and the close brief name optional; write a new close record without `brief`.
3. `src/state.ts`: validate a brief only for an approval with `brief-sha256`; skip the brief step for a new approval; keep the altered-after-approval detection and every Bound check.
4. `src/commands/close.ts`: do not require a brief for a new approval; include `brief` in the close record only when legacy.
5. `src/commands/run.ts`: ensure a new briefless revision is not held by a brief defect; a legacy brief still holds once its revision is approved.
6. `src/brief.ts`: keep as the legacy parser; no new brief is authored.
7. `skills/grace5-prepare/SKILL.md`: remove the independent brief writer and the brief owner-gate step; the owner reads the contract and answers approve/reject. Keep the interview, contract, checks and owner gate.
8. `skills/grace5-orchestrate/SKILL.md`, `grace5-execute/SKILL.md`, `grace5-review/SKILL.md`: remove brief handoff references; the reviewer still receives the contract, complete diff, receipts and cited rules.
9. `models/architecture/method.md`, `authorization.md`, `evidence-records.md`, `commands.md`, `conformance.md`, `m2-proposal.md`, `README.md`, `AGENTS.md`: state the contract-only approval, legacy brief handling and the measurement consequence.
10. Delete `models/architecture/brief.md` and `models/architecture/templates/brief.html` from the active surface; keep `models/architecture/examples/**` untouched as historical fixtures.
11. Amend rationale-ledger L-04 (retired) and L-05 (contract-only binding).
12. Add `src/conformance/briefless.test.ts` for the new path and the legacy path; update existing brief-dependent tests so historical cases still pass.
13. Regenerate `models/architecture/cli-reference.md` and `packages/`; run CK1-CK8.

## Measurement consequence

The control center's M2 metrics read brief metadata (`grace5.brief.*`, `grace5.brief.writer_self`). New changes will have no brief, so those metrics become unavailable for them. `models/architecture/m2-proposal.md` records the gap; `grace/optimize/METHOD.md` and `graceopt` are outside this repository and are not changed here.

## Verification focus

- CK2/CK6: a new change with no brief approves, starts, runs, reviews and closes; a legacy brief still validates and a mismatched legacy brief still refuses.
- CK5/CK8: the active guidance and surface no longer instructs or carries a brief.
- CK3/CK7: examples and every closed change remain clean.
- CK1/CK4: typecheck, generated packages and CLI reference remain current.
- The change registers no version, pin, tag or migration row.
