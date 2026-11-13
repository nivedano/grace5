# Notes of C-0004-upgrade-command

Sequence, technical detail and discovered sub-steps. Mutable, never approved.

## Sequence

1. Pin module `src/upgrade/pin.ts` (read, write, compare, refusal), `kernelVersion()` in `records.ts`, `package.json` 0.3.0 and `.grace5/kernel-version` 0.3.0 in the same step, so the kernel keeps operating on this repository once the commands check the pin.
2. Steps `src/upgrade/steps.ts` (0.1.0 to 0.2.0: move closed siblings under `closed/`, ignore line; 0.2.0 to 0.3.0: write the pin) and the skill refresh from `packages/skills/`.
3. Chain `src/upgrade/chain.ts`: composition from the pin to the kernel's version with pin bumps for boundaries without a step, the plan, application with a pin after each step, the hash snapshot before and the post-upgrade check after. The runner takes its steps and kernel version as inputs so a test can inject a failing or a mutating step.
4. Command `src/commands/upgrade.ts`, `--plan` in `cli.ts`, the pin check in `cli.ts` for every command but `status`, `upgrade`, the flags and `init` without `.grace5/`; `init` writes the pin; `status` prints `kernel: <version>, state: <pin>`.
5. Tool `src/tools/upgrade-verify.ts` (CK6): clone at `v0.2.0`, snapshot with the new kernel's reader, `upgrade --root`, assert.
6. Conformance helper writes the pin into every fixture; `src/conformance/upgrade.test.ts` with UP-01 to UP-11.
7. Documents, skills, help text, `bun run package`.
8. Iterate with `run --check`; commit receipts last.

## Details

- A clone of this repository at `v0.2.0` has no pin and its closed changes already under `closed/`, so it reads as 0.1.0 and the chain runs both steps; the first moves nothing and appends nothing. That is the idempotence case CK6 exercises.
- The hash snapshot and the post-upgrade check read the changes with `evaluate()` directly, never through the `check` command, because the stale pin would refuse `check` before the upgrade.
- The post-upgrade check fails on a new defect, a changed contract or definition hash, or an id missing or appearing; a defect present before the upgrade is not the upgrade's.
- A step failure after a completed step leaves the pin at that step's `to`; a failure of the first step leaves the pin as it was.
- Skill refresh mirrors `packages/skills/<name>/` into an existing `.agents/skills/<name>/` or `.claude/skills/<name>/` only for the names the kernel packages; other `grace5-*` directories (a repository's own) are left alone.
