---
name: grace5-prepare
description: Use when a GRACE 5 change has to be opened or its contract revised, before any execution. Covers the risk triage, the interview, contract.xml, the independent contract read, and recording the owner's decision.
---

# Prepare a GRACE 5 change

Before working, discover extensions for `preparer` by reading only the `roles` and `when` headers of `.grace5/extensions/*.md`, then load matching bodies (`method.md`, Local extensions). Repeat discovery when your role changes. The independent contract reader uses `contract-reader`.

File names below refer to the GRACE 5 method documents: `models/architecture/` in the GRACE 5 repository, elsewhere those shipped with the package. `method.md` is the whole method; read it once.

## Before opening a change

- Edit a chore directly, without asking or creating a contract, approval or receipts, when its worst outcome is visible and reversible with the project's own commands. Verify and commit it.
- Open a full change when risk to behaviour, boundaries, evidence or state exceeds that test, including when a direct edit grows beyond it. An explicit specification request always gets one.

## Interview

- Read the repository and its rules. Ask only for owner decisions: behaviour, boundary, non-goals, acceptable evidence and owner burdens. Sequence, file choice and technique belong in `notes.md`, not questions.
- Record policies and tradeoffs as neutral Decisions with explicit technical literals and responsibilities, without dialogue, speaker labels or conversational dates. Record approval separately below.

## Contract

- Create the change with `grace5 init <id>`; the id must be new, open or closed. A pin refusal means the state is behind the kernel: run `grace5 upgrade` first; `upgrade.md` names the ways out when a step touches an open change. Write `contract.xml` to `schemas/contract.xsd`: eight sections in fixed order, described in `method.md`.
- State the behavioural delta once, in Change. Cite a standing rule by path in `rule`; never recopy its text. No tasks, no sequence, no pre-written code.
- Affected names what may be written, and Protected what must not be (`authorization.md`).
- Never bump the version or pin or register migration boundaries or rows; a release is a separate owner-requested act (`upgrade.md`).
- Each check must reject broken behaviour; `grace5-review` judges its discriminating power.
- A check decides between candidates only on the candidate's own bytes. Where its result depends on an excluded input — the installed `grace5-*` skills or anything else under a kernel-managed path — it cannot: state it as installation health, re-evaluated afresh at handoff (`source-identity.md`, `upgrade.md`), not as candidate evidence. Binding such an input into evidence needs a bounded fingerprint under its own approved contract; do not hash caches or the state directory.
- Choose Automated when a project command's exit status separates working from broken. Choose Trace over Manual whenever the behaviour leaves ordered lines in a log a command can capture, because the kernel then checks sequence and provenance itself (`trace-provenance.md`). Keep Manual for what only a person can judge, and declare its Environment.
- A check that is red before the work starts is fine, and is often the reason for the change.
- Run `grace5 check <id>` and clear every `defect:` line. Size is reported, not enforced; explain an excess to the owner in the Decisions or in `notes.md`.

## Feasible, discriminating checks

- Before approval, identify each required check's device, build, environment state and observation. Establish availability with read-only diagnostics; report unknowns honestly and never invent observations.
- If evidence is unavailable, ask the owner to wait or accept alternative evidence with its limitation. Never optionalise a required check yourself. Record unavailable-environment failures separately from product regressions.
- Feasibility authorizes no flashing, reset or hardware-state change and never counts as a check result.
- The contract's evidence discussion must name a plausible faulty implementation the check would reject and, for a trace, the setup whose absence would also fail, so a bare missing marker cannot pass.
- Running an unchanged approved check needs no reapproval; it produces evidence for the current candidate.

## Independent contract read

Before the owner gate, hand the contract, without the conversation, to an independent subagent that did not write it. Give it exactly this task:

> Discover extensions for `contract-reader` as `method.md`, Local extensions describes. Read `.grace5/changes/<id>/contract.xml`, the rule files the contract cites in a `rule` attribute, and the repository read-only to confirm cited paths. You may run `grace5 check <id>` for the contract hash, word count and check count. Read no notes and ask for no background, because the contract must stand alone. Write nothing. Return findings only: a criterion its check cannot serve, an undefined term, a contradiction, a boundary that does not cover Change, a cited path that does not exist.

- The reader proposes no design and decides nothing. The author resolves every finding by editing the contract, reruns `grace5 check`, and only then does the owner gate happen.
- This findings-only read is the whole pre-approval independence. Produce no brief page. Final review is separate (`grace5-review`).
- Without subagents, do the read yourself and tell the owner so.

## Owner gate

- Give the owner the contract. They answer in one statement: approve, or reject with the reason.
- Record it in `records/approval-<rev>.xml` (`schemas/approval.xsd`): the decision, date, and the contract and definition hashes exactly as `grace5 check` prints them. A rejection carries its reason in `Statement`. Omit personal attribution and conversation excerpts; compute nothing else by hand.
- Never set or infer an approval. `authorization.md` says which words count and how a rejection is recorded. An approval authorizes execution; new records carry neither `executes` nor `Execution`. An approval worded to defer the start, such as "approved, hold", remains an approval: wait until the owner starts the change or a batch, and record no hold state.

## Material revision

After an approval or rejection, any contract edit is a material revision: increment `revision` (never reuse a rejected number), rerun `grace5 check`, repeat the independent read for material changes, and obtain approval before resuming execution. `authorization.md` defines what may run meanwhile.

Complete revision preparation and the owner gate in the conversation that revealed the need. Present only the unresolved owner decision. Reuse approval of an exact unchanged revision; do not request it again.

Next: `grace5-execute`.
