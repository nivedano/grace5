---
name: grace5-release
description: Use when the owner explicitly requests a new framework version. Prepare and verify the version, migration boundary and generated packages, then commit the release record and tag the clean release commit. Does not publish or install the release.
---

# Release the framework

This skill is framework tooling in `.agents/skills/`: it is not shipped (it is not under `skills/` and never enters `packages/`), it is not part of the installed CLI, and it is not a GRACE 5 change. Edits to this skill follow the repository's rule for ordinary source edits to local skill definitions in `AGENTS.md`.

A release is an owner-requested tooling act, outside the change lifecycle (`models/architecture/upgrade.md`, `rationale-ledger.md` L-25). Verify it with the mechanical checks below and record their results under `models/decisions/`. The owner authorizes the release and its version; this skill grants no approval and infers no request.

## Before the act

- The owner has requested a release and named the version, or confirmed the one proposed here (the next minor when the carried changes add surface, the next patch otherwise). The record names the request's date; it quotes no conversation.
- The tree is clean: `git status --porcelain` prints nothing. Uncommitted work is committed or parked by its own change first; the release commits nothing of anyone else's.
- Every change that must ship is closed. The record names the closed changes under `.grace5/changes/closed/` that the previous release tag does not carry.
- No change is open: `bun src/cli.ts status` lists none. A release commit landing inside an open change's lifetime would enter its complete diff, and the release record's home is a path a change may protect.
- Read `models/architecture/upgrade.md` and confirm the current policy and shipped lifecycle skills already describe release as a tooling act. Repair policy inconsistencies in an ordinary change before releasing; release execution rewrites no standing policy or skill prose.
- The requested version has the kernel-supported form `X.Y.Z`, is greater than the current version, and has no existing `v<version>` tag. Select the previous release tag from the current version in `package.json`; confirm that tag exists, is an ancestor of HEAD, and agrees with this repository's pin and README status line. Stop on a disagreement; listing tags alone does not establish the release base.

## The act, in order

1. **Version.** Set `version` in `package.json` and the README status line to the release version.
2. **Migration boundary, only if needed.** Compare canonical `skills/`, state layout, schemas that affect stored state, and local ignore-file requirements against the previous release tag. A pure kernel behavior change with no stored-state or installed-skill change needs no step. A skill-content-only boundary may add a refresh-only step to `src/upgrade/steps.ts`: `apply` does nothing because the runner refreshes existing packaged skill directories before `verify`; `verify` rejects missing or drifted files in those installed directories using the same packaged source; `touches` returns `[]`; `describe` is one sentence. New or removed skill installations, state-layout or ignore-file moves, and record/schema transformations require migration implementation and tests prepared in a closed ordinary change first. Those changes may prepare helpers, but register no future boundary and add no versioned table row. If that implementation is absent, stop and prepare the change before retrying the release. Register the tested implementation for the previous-version-to-release-version boundary, add its row to `models/architecture/upgrade.md`, and add a conformance case proving the registration and verification. Preserve its actual declared writes; never replace them with an empty `touches` to bypass open-change protection.
3. **Generate.** Run `bun run package`. This deliberately regenerates version-bearing manifests and canonical skill copies; inspect the diff for only expected generated output. No generated file is edited by hand.
4. **Verify before upgrading this repository.** From the repository root run `bun run check`, `bun test --parallel`, `bun run examples:verify` and `bun run package:verify`; each must exit 0. Tests must already support later target versions while retaining historical boundary assertions; repair release-blocking test assumptions in an ordinary change instead of weakening tests during a release. Then clone the repository at the previous release tag under `.tmp/`, preserving its pin, and lay out one valid open change and installed packaged skills in both supported locations. Invoke the new kernel explicitly with `bun <absolute-path-to-this-checkout>/src/cli.ts --root <clone> upgrade`, not the clone's old CLI. Check exit 0, the exact expected boundary plan, `upgraded: <previous-version> -> <release-version>`, and unchanged contract hashes, definition hashes and candidate for the open change. For a step, seed stale installed files and require byte equality with the package after refresh, plus the migration's own expected state. For a pin-only bump, record installed bytes first and require them unchanged, with no refresh lines; even deliberately stale skills remain untouched on a bump. Run upgrade again and require `up to date: <release-version>` and no further writes. The existing `upgrade:verify` tool is a historical-chain test, not a substitute: it is fixed to an older tag. Any failure stops the act: restore only this act's tracked edits to their clean starting bytes, report the failure, and tag nothing.
5. **Upgrade this repository.** Run `bun src/cli.ts upgrade` to apply the verified boundary and write `.grace5/kernel-version`; do not merely stamp a new pin over unmigrated state. Require `bun src/cli.ts status` to read `kernel: <version>, state: <version>` with no open changes, and a second `bun src/cli.ts upgrade` to print `up to date: <version>`. Verify the expected state and installed skills here too, and rerun `bun run package:verify`. Any failure stops before commit or tag.
6. **Record.** Write `models/decisions/<date>-release-<version>.md`: the version, previous tag, request date, carried closed changes, registered step or "none, a pin bump", the four verification commands' exit statuses, the clone's plan and final lines, the step-or-bump skill check, and the local upgrade results. The record names `v<version>` and states that its release commit carries this record, which `git rev-list -n 1 v<version>` resolves. It quotes no hash of its own commit. The kernel reads nothing of this record. After verification, change no source except this record; any other source edit requires repeating verification.
7. **Commit** only the inspected files of the act, including generated output and the record, with a `Release: <version>` trailer. Require a clean tree and confirm the commit contains the intended version, pin and record.
8. **Tag** `v<version>` on that verified commit. Never move or rewrite an existing tag or history. Confirm `git rev-list -n 1 v<version>` equals HEAD and the tree is clean.

## The act never

- Publishes the package or installs anything machine-wide; each remains a separate owner-requested action.
- Edits canonical skill prose, kernel behavior or schemas beyond the migration registration and refresh-only step allowed above. Generated packages are regenerated as step 3 requires; the carried changes otherwise ship exactly as they closed.
- Authors a change contract, approval, run receipt, review or close record. An upgrade may apply the declared state writes of the tested migration; the release adds no change-lifecycle ceremony.
- Tags before verification and the local upgrade have passed, or on a dirty tree.
- Moves an existing tag, rewrites history, or bumps the version outside this act.

## After the act

Report the record's path, the tag and the verification results to the owner. The status and idempotence checks precede the tag; completing the act requires no later source edit or commit.
