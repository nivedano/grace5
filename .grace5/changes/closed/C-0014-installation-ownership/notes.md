# Implementation notes

Prepared 2026-11-17. No approval recorded; execution has not started.

## Scope

Control-center intervention I-010 (installation evidence consistency). This change owns the package-owned installed-skill rule, the installation-health tool, and the handoff-time freshness rule for checks that depend on excluded inputs.

## Order and dependencies

- Execute before C-0018 (deduplicated packages); C-0018 preserves this ownership and resolver rule.
- No dependency on C-0012, C-0013, C-0015, C-0016 or C-0017.
- If C-0018 lands first, this change must adapt to its build-time package layout.

## Implementation outline

1. Add `src/tools/installation-health.ts`: read the pin, resolve packaged skills, compare every installed `grace5-*` directory under `.agents/skills/` and `.claude/skills/`, report differing paths and exit nonzero; write nothing; treat a missing packaged source as actionable.
2. Add tests under `src/tools/installation-health.test.ts` or `src/conformance/`: corrupt an installed file, restore it, corrupt a project-owned skill, exercise both skill locations, and check record-only commits do not invalidate source evidence.
3. State package ownership and handoff-time freshness in `models/architecture/upgrade.md`, `source-identity.md`, `skills/grace5-prepare/SKILL.md` and `skills/grace5-execute/SKILL.md`.
4. Add one rationale-ledger entry for installation health; do not add a fingerprint mechanism.
5. Regenerate packages; run `bun run check`, `bun test --parallel`, `bun run package:verify`, `bun src/tools/installation-health.ts --help`, and `bun src/tools/installation-health.ts`.

## Verification focus

- Reproduce a clean upgrade followed by project mirror validation twice without alternating rewrites.
- Corrupt installed skill bytes: health fails. Restore exact bytes: health passes. Corrupt project-owned skill: existing mirror check still fails.
- No assertion is removed to turn an installation failure green; no automatic repair is added.
