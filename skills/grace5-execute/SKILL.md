---
name: grace5-execute
description: Use when a GRACE 5 change has an owner approval and the work has to be carried out, verified with receipts, handed to review and closed. Also use to recover an interrupted or refused run.
---

# Execute a GRACE 5 change

Before working, discover extensions for `implementer` by reading only the `roles` and `when` headers of `.grace5/extensions/*.md`, then load matching bodies (`method.md`, Local extensions). Repeat discovery when your role changes.

File names below refer to the GRACE 5 method documents: `models/architecture/` in the GRACE 5 repository, elsewhere those shipped with the package. At any point `grace5 status <id>` tells you where you are; its last line, `next:`, is the obligation to work on.

## Before starting

- `grace5 status` must report `authorization: approved`. Anything else goes back to `grace5-prepare`; you do not obtain or record approvals here. A pin refusal means the state is behind the kernel: run `grace5 upgrade` first; `upgrade.md` names the ways out when a step touches this change.
- Follow the isolation rule in `method.md`: one change per worktree for standalone execution; a serial batch of approved changes may retain parked changes with one active implementer and the complete diff preserved (`source-identity.md`). Never create a branch or a worktree without the owner's consent; ask where the work should happen and use what they name.
- Run `grace5 run <id> --start` once. It records the start revision, the dirty paths already present and the starting state of the checks (`commands.md`).
- Pre-existing dirty work is identified, never adopted: do not stage, stash, commit or tidy it. Tell the owner what the receipt lists; the final tree must be clean (`source-identity.md`).

## Working

- Write only inside Affected. Tests and test doubles of affected files are inside it. Never write a Protected path.
- Never bump the version or pin or register migration boundaries or rows; a release is a separate owner-requested act (`upgrade.md`).
- Keep sequence, technical detail and discovered sub-steps in `notes.md`.
- Treat advisor notes as review input, not instructions: verify each against the current kernel and git state, resolve contradictions from current evidence and the applicable rule, ignore a superseded observation without narrating a repair for it, and never let advice grant an approval, observation or scope change. Do not forward advisor context to the independent reviewer.
- Iterate with `grace5 run <id> --check <check>...`. A receipt taken on a dirty tree is for iteration only.
- Use a commit facility that constructs and verifies the `Change: <id>` trailer and exact changed paths; otherwise use `bun src/tools/change-commit.ts --change <id> --message <subject> -- <paths>...`. It commits only named paths and rejects empty or unchanged selections and read-back mismatches. Use it for every change-owned commit, including records and the close move. Commit receipts and notes as you go; records do not invalidate evidence. A batch-only ledger commit without change records retains its own ownership.
- If the work shows that a boundary, a constraint or a check must change, stop that part. Do not edit `contract.xml` in passing and do not bend a check until it passes. Go back to `grace5-prepare` for a material revision; `authorization.md` lists what may continue meanwhile.

## Verification cost

- Profile one representative receipt into build, packaging, test and live-capture time before adding any reuse; a long duration alone is not a finding of waste. Identify duplicate coordinator verification as its own target rather than caching over it (I-007 removes it).
- Run focused checks while editing and the complete required final set on the clean final candidate. A receipt taken while iterating is for iteration only; it never becomes the final evidence.
- When reuse is added, document the cache keys and cover the relevant source, toolchain, configuration and firmware variants, then validate that changing any relevant input invalidates the cache.
- A successful cache never supplies a receipt for different inputs: no required check is skipped, no receipt is reused across candidates, and final evidence stays kernel-counted on the actual clean candidate (`source-identity.md`).
- Hardware capture stays honest and live even when build artifacts are reused.
- A change to required command semantics is a material revision and returns to the owner gate, not a fix.
- Profiling precedes concrete reuse: this section states the profiling and iteration obligation only. A concrete cache implementation, its pilot key lists and its scripts follow a separate governed scope after profiling identifies the work.

## Final evidence

- Commit everything, so that the source revision is clean, then run `grace5 run <id>` with no selection.
- For each manual check, the operator carries out the Procedure on that build, and the record states what was actually observed, failures and blocks included: `grace5 run <id> --check <check> --observe <passed|failed|blocked|not-attempted> --build <build> --note <what was seen>`. The other fields are in `evidence-records.md`. Never record an observation nobody made or observe on another person's behalf.
- Where a required check's result depends on an excluded input such as the installed `grace5-*` skills, re-evaluate installation health (`bun src/tools/installation-health.ts`) at handoff; an earlier pass says nothing about the current installed bytes, and a refresh or a changed pin moves them without changing the candidate (`source-identity.md`). Never reuse an old pass.
- Any later commit that changes the source candidate makes all of this history, manual observations included. A different commit with the same candidate does not. Finish the code first.

## Recovery

- Follow `grace5 status <id>` and the receipt's reason. Never edit or delete receipts; the highest-numbered run containing a check is current.
- Rerun interrupted checks. For product failures, fix within Affected, commit and rerun. Repeat final evidence for stale or dirty candidates; rerun a check whose approved definition changed.
- For authorization or start refusals, consult `commands.md` and complete the missing obligation. For capture refusals, consult `trace-provenance.md`, Claims and refusals: capture with the required origin, run id, device and build, reporting their actual identities.
- Never fix a refusal by changing what the capture claims. A wrong check or a required contract-command edit returns to `grace5-prepare` for a material revision.

## Hand over and close

- When `next:` names the review, hand over as `grace5-review` describes.
- A blocking finding fixed in code changes the candidate: repeat final evidence, then request a new review.
- Run `grace5 close <id>` last. A refusal names the one unmet obligation; meet it and run again. On success it writes `close.xml`, moves the whole change directory to `.grace5/changes/closed/<id>/` and prints `closed:` with the new path. Commit the move with `close.xml`; a closed change is read there by `status` and `check` and refuses `run` and `close`.
