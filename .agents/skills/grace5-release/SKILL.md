---
name: grace5-release
description: Use when the owner requests a framework release with a new version. Carries out the release act - version, migration step where the boundary needs one, pin, mechanical verification, tag and record - as framework tooling outside the shipped surface. A release is not a change and is not verified by the change machinery.
---

# Release the framework

This skill is framework tooling in `.agents/skills/`: it is not shipped (it is not under `skills/` and never enters `packages/`), it is not part of the installed CLI, and it is not a GRACE 5 change. Edits to this skill are ordinary changes like any other source.

A release is not verified by the kernel's change machinery, because that machinery is the kernel the release creates: receipts, reviews and close all read the running kernel's rules, and a release moves the version, the pin and the steps those rules live in. The owner's ruling of 2026-11-16 disposes the release-as-change form; `rationale-ledger.md` L-25 is amended to match. The release is verified instead by the mechanical checks below, each run before the next act, and recorded in a release record under `models/decisions/`. The owner gates every release; this skill gates nothing on the owner's behalf and infers no request.

## Before the act

- The owner has requested a release and named the version, or confirmed the one proposed here (the next minor when the carried changes add surface, the next patch otherwise). The record names the request's date; it quotes no conversation.
- The tree is clean: `git status --porcelain` prints nothing. Uncommitted work is committed or parked by its own change first; the release commits nothing of anyone else's.
- Every change that must ship is closed. The record names the closed changes under `.grace5/changes/closed/` that the previous release tag does not carry.
- No change is open: `bun src/cli.ts status` lists none. A release commit landing inside an open change's lifetime would enter its complete diff, and the release record's home is a path a change may protect.
- The previous release tag exists and no tag moves: `git tag --list "v*"`.

## The act, in order

1. **Version.** Set `version` in `package.json` and the README status line to the release version.
2. **Migration step, only if the boundary needs one.** Compare the packaged skills and the state layout against the previous release tag. If installed skills or the state layout differ, add one step to `src/upgrade/steps.ts` for the boundary: `apply` refreshes every installed `grace5-*` directory from the packaged skills and creates no location; `verify` throws on any missing or drifted file; `touches` returns none; `describe` is one sentence. Add its row to the step table of `models/architecture/upgrade.md` and one conformance case under `src/conformance/` that fails when the step is absent or its verify tolerates drift. A boundary that needs any other kind of step - a state-layout move, a record rewrite, a schema change - is not released by this act: that work is a change first, closed with its own evidence, and released afterwards.
3. **Verification, before the pin.** From the repository root run `bun run check`, `bun test --parallel`, `bun run examples:verify` and `bun run package:verify`; all must exit 0, and the suite carries the step's case when step 2 added one. Then, in a scratch clone of this repository at the previous release tag under `.tmp/`, carrying the clone's pin, stale installed skills in both supported locations and one open change laid out, run the new kernel's `upgrade` on the clone: it must print the single boundary step, or a `bump:` line when step 2 added none, end with `upgraded:`, refresh the installed skills to byte equality with the package, and leave the open change's contract and definition hashes and its candidate unchanged. Any failure stops the act: revert steps 1 and 2, report the failure, and tag nothing.
4. **Pin.** Write `.grace5/kernel-version` with the release version.
5. **Documents.** Amend `models/architecture/upgrade.md`, `models/architecture/method.md`, `AGENTS.md` and `rationale-ledger.md` L-25 where they describe a release as a change, to cite this skill. Nothing else in the standing documents moves.
6. **Commit** everything of the act with a `Release: <version>` trailer.
7. **Tag** `v<version>` on that commit. Never move or rewrite an existing tag or history.
8. **Record.** Write `models/decisions/<date>-release-<version>.md`: the version, the previous tag, the carried closed changes, the step added or "none, a pin bump", the four verification commands' exit statuses, the upgrade clone's plan and final lines, the commit and the tag. The record is evidence of the act; the kernel reads nothing of it and it is no change's record.

## The act never

- Publishes the package or installs anything machine-wide; each remains a separate owner-requested action.
- Edits skill text, kernel behaviour, schemas or generated packages beyond the step of rule 2; the carried changes ship exactly as they closed.
- Writes a change directory, an approval, a run receipt or any kernel record; the release borrows no change's ceremony.
- Tags before step 3 has passed, or on a dirty tree.
- Moves an existing tag, rewrites history, or bumps the version outside this act.

## After the act

`bun src/cli.ts status` reads `kernel: <version>, state: <version>`, and `grace5 upgrade` in this repository prints `up to date: <version>`. Report the record's path and the tag to the owner.
