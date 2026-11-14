# C-0009-decision-not-conversation — notes

Working notes only; not part of the contract. Sequence and technical detail live here.

## Why this change exists

- Owner requirement, 2026-11-14: `Source` is redundant storytelling that commits conversational detail; `Statement` should be a single `approved`, with no reason to hold more.
- Owner requirement, 2026-11-14: no change makes a version on its own; creating and installing a version is an explicit owner request, and one version carries many changes.

## Facts established while preparing

- The kernel never reads `Source`: `grep` over `src/` finds it only in the conformance fixture (`src/conformance/helper.ts`).
- `grace5-review` never hands the reviewer the approval record, so the rationale's "the review reads it against the conversation" had no procedure.
- All eight closed contract revisions so far bumped the version and shipped a migration step. This change is the first that does not.
- `C-0007-orchestrate-skill` is open, approved and implemented (commit e3fe433), with `next: check CK1: recorded dirty`. It overlaps `skills/**`, `models/architecture/**`, `README.md` and `package.json`. It closes before this change's final evidence; no branch or worktree.

## Surface to edit

1. `models/architecture/schemas/approval.xsd`
   - `Statement`: `minOccurs="0"`; comment: an approval carries `approved`, a rejection its reason.
   - `Source`: `minOccurs="0"`; comment: legacy, accepted and ignored; new records omit it.
   - Legacy `Execution` block untouched.
2. `src/conformance/helper.ts` — `writeApproval` stops writing `Source` and writes `approved` as the approval statement.
3. `src/conformance/receipts.test.ts` — AUTH-04 (no `Source`; runs and closes), AUTH-05 (legacy `Source` still validates and is ignored), AUTH-06 (rejected with empty `Statement` is a defect).
4. `src/conformance/failure.test.ts` — REL-01: a change closes with `--version` and the pin unchanged; no change command writes `package.json` or `.grace5/kernel-version`.
5. `src/` validation — the rejection-reason defect in `check` (same module as the existing record checks; find where approval defects are reported).
6. `models/architecture/authorization.md` — table row for the owner's words, and the paragraph at line 18.
7. `models/architecture/upgrade.md` — new section "Versions are releases".
8. `models/architecture/method.md` — one paragraph citing the release rule.
9. `models/architecture/cli-reference.md` — check rule 8 (rejection reason); regenerate with `bun run package`.
10. `models/architecture/conformance.md` — AUTH-04..06, REL-01 rows.
11. `models/architecture/m2-proposal.md` — approval fidelity no longer samples statements; redefine or drop.
12. `models/architecture/rationale-ledger.md` — amend L-05, add L-25.
13. `skills/grace5-prepare/SKILL.md` — record `approved` or the rejection reason; no `Source`; no version bump when preparing.
14. `skills/grace5-execute/SKILL.md` — never bump the version, the pin or a step.
15. `skills/grace5-review/SKILL.md` — a blocking finding when a non-release change bumps the version, pin or step.
16. `skills/grace5-orchestrate/SKILL.md` — only if it mentions versioning; check before editing.
17. `AGENTS.md` — a rule: version is an owner-requested release.
18. `README.md` — the status line says the version is the last release and is updated only at release.

## Verification

- `bun run check`
- `bun test src/conformance/receipts.test.ts src/conformance/failure.test.ts src/conformance/upgrade.test.ts --test-name-pattern "AUTH|REL"`
- `bun run examples:verify`
- `bun run package:verify`
- CK5: `--version` and pin stay `0.6.0`
- CK6: every change in either location reads with no defect

## Open points for the owner gate

- Ordering: C-0007 closes first (proposed in D6).
- No release is cut here; 0.7.0 is not created.

## Gate outcome

- Owner, 2026-11-14: `decision=approved`, `ordering=start C-0009 now`. C-0007 stays open and is not written; its final evidence is rerun after this change, which the execute skill's recovery rule covers. This overrides D6's ordering sentence only; the isolation part of D6 stands (C-0007 protected, no branch, no worktree, master).
- The approval record is written by grace5 0.6.0, so it carries one factual `Source` line; the change removes `Source` from records written after it.

## Review 1 and the fixes it prompted

- Independent review 1: 0 blocking, 5 non-blocking; authorization, upgrade, rationale-ledger and AGENTS.md upheld; no outside or protected path.
- Fixed before close: the fixture brief in `helper.ts` still told the owner their words are recorded; it now carries the template's sentence. AUTH-04 was joined by a case for an approved record with no `Statement`, which the amended schema permits and the old one refuses.
- Not fixed, and recorded as non-blocking: AUTH-05 and REL-01 are compatibility guards that pass before the change, so A1's "fails without the change" overstates them; the approved brief-1.html keeps its old sentence because editing it would break the approval's brief hash; the L-23 wording edit stretches K3 narrowly.
- The fixes change the source candidate, so final evidence is rerun and review 2 covers the new candidate; review 1 stays as history.


