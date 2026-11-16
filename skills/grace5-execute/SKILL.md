---
name: grace5-execute
description: Use when a GRACE 5 change has an owner approval and the work has to be carried out, verified with receipts, handed to review and closed. Also use to recover an interrupted or refused run.
---

# Execute a GRACE 5 change

Before working, read the repository's optional `.grace5/extensions/` files and follow those addressed to your role (`method.md`, Local extensions).

File names below refer to the GRACE 5 method documents: `models/architecture/` in the GRACE 5 repository, elsewhere those shipped with the package. At any point `grace5 status <id>` tells you where you are; its last line, `next:`, is the obligation to work on.

## Before starting

- `grace5 status` must report `authorization: approved`. Anything else goes back to `grace5-prepare`; you do not obtain or record approvals here. A pin refusal means the state is behind the kernel: run `grace5 upgrade` first; `upgrade.md` names the ways out when a step touches this change.
- Follow the isolation rule in `method.md`: one change per worktree for standalone execution; a serial `grace5-orchestrate` batch of approved changes may retain parked changes with one active implementer and the complete diff preserved (`source-identity.md`). Never create a branch or a worktree without the owner's consent; ask where the work should happen and use what they name.
- Run `grace5 run <id> --start` once. It records the start revision, the dirty paths already present and the starting state of the checks (`commands.md`).
- Pre-existing dirty work is identified, never adopted: do not stage, stash, commit or tidy it. Tell the owner what the receipt lists; the final tree must be clean (`source-identity.md`).

## Working

- Write only inside Affected. Tests and test doubles of affected files are inside it. Never write a Protected path.
- Never bump the version or pin or register migration boundaries or rows; a release is a separate owner-requested act (`upgrade.md`).
- Keep sequence, technical detail and discovered sub-steps in `notes.md`.
- Iterate with `grace5 run <id> --check <check>...`. A receipt taken on a dirty tree is for iteration only.
- Commit through the change-commit routine, which constructs and verifies the `Change: <id>` trailer instead of relying on memory: where the harness has no verified commit facility, `bun src/tools/change-commit.ts --change <id> --message <subject> -- <paths>...` commits exactly the named paths with `git commit --only` and reads the created commit back — its parsed `Change: <id>` trailer and its changed-path list — before accepting it, refusing an empty selection, a path with no modified content and any read-back mismatch. Use it for every change-owned commit: product, test, evidence and observation records, the review record and the close move. Commit receipts and notes as you go; committing records never invalidates evidence. A batch-only ledger commit that carries no change's records follows its actual ownership and is not assigned to a change.
- If the work shows that a boundary, a constraint or a check must change, stop that part. Do not edit `contract.xml` in passing and do not bend a check until it passes. Go back to `grace5-prepare` for a material revision; `authorization.md` lists what may continue meanwhile.

## Final evidence

- Commit everything, so that the source revision is clean, then run `grace5 run <id>` with no selection.
- For each manual check, the operator carries out the Procedure on that build, and the record states what was actually observed, failures and blocks included: `grace5 run <id> --check <check> --observe <passed|failed|blocked|not-attempted> --build <build> --note <what was seen>`. The other fields are in `evidence-records.md`. Never record an observation nobody made or observe on another person's behalf.
- Where a required check's result depends on an excluded input such as the installed `grace5-*` skills, re-evaluate installation health (`bun src/tools/installation-health.ts`) at handoff; an earlier pass says nothing about the current installed bytes, and a refresh or a changed pin moves them without changing the candidate (`source-identity.md`). Never reuse an old pass.
- Any later commit that changes the source candidate makes all of this history, manual observations included. A different commit with the same candidate does not. Finish the code first.

## Recovery

- Interrupted run: `status` prints `interrupted: run-<n>`. Receipts are never edited or deleted. Rerun the affected checks; the highest-numbered run that contains a check is current.
- Failed check: fix the product inside Affected, commit, rerun. A check that is wrong is a material revision, not a fix.
- Stale candidate: `recorded on an earlier candidate` or `recorded dirty` means the result does not belong to the clean final revision. Repeat the final evidence step.
- `definition changed since the result`: the check was amended in an approved revision. Rerun that check.
- Refused check. The receipt gives one of these reasons (`trace-provenance.md`):
  - `amended in unapproved revision`: the owner has not approved the revision that added or changed this check. Finish the owner gate.
  - `live provenance missing`: the capture command printed no provenance line carrying this run's id. Make it capture now and report it.
  - `origin is <origin>, check requires <origin>`: the log has the wrong origin. Run the capture the check requires.
  - `device mismatch`: the reported device is not the one the Environment declares. Use that device.
  - `build mismatch`: the device or the observer's stated build is not the candidate. Flash or install the committed revision.
  - `identity missing`: the Environment declares a device or build and the capture reported none. It must report them.
- A refused invocation (`refused: <reason>`, no receipt) names an authorization or start obligation; `commands.md` lists the phrases.
- Never answer a refusal by changing what the capture command claims. If its text in the contract must change, that is a material revision.

## Hand over and close

- When `next:` names the review, hand over as `grace5-review` describes.
- A blocking finding fixed in code changes the candidate: repeat final evidence, then request a new review.
- Run `grace5 close <id>` last. A refusal names the one unmet obligation; meet it and run again. On success it writes `close.xml`, moves the whole change directory to `.grace5/changes/closed/<id>/` and prints `closed:` with the new path. Commit the move with `close.xml`; a closed change is read there by `status` and `check` and refuses `run` and `close`.
