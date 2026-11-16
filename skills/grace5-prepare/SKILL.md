---
name: grace5-prepare
description: Use when a GRACE 5 change has to be opened or its contract revised, before any execution. Covers the risk triage, the interview, contract.xml, the independent brief, and recording the owner's decision.
---

# Prepare a GRACE 5 change

Before working, read the repository's optional `.grace5/extensions/` files and follow those addressed to your role (`method.md`, Local extensions).

File names below refer to the GRACE 5 method documents: `models/architecture/` in the GRACE 5 repository, elsewhere those shipped with the package. `method.md` is the whole method; read it once.

## Before opening a change

- Triage the request by risk, not by habit. A chore — a minor skill-text correction, a small CLI bug fix, a similarly contained edit — is carried out directly, without a specification and without asking; keep bureaucracy low.
- The test is consequence: if this edit goes wrong, can the damage be seen and undone with the project's own commands? If yes, edit directly. If the risk outruns what a direct edit can tackle — behaviour, boundaries, evidence or state others depend on — open a full GRACE 5 change.
- An explicit request for a specification always gets one.
- A direct edit is an ordinary source edit outside the lifecycle: no contract, brief, approval or receipts. Verify it with the project's own commands and commit it; if the work grows past the triage, stop and open a change.

## Interview

- Read the repository and its rule files first. Ask the owner only what is theirs to decide: behaviour, boundary, what is left alone, what evidence they accept, what burden they take on (a bench session, a manual procedure).
- Do not ask procedural questions. Sequence, file choice and technique are yours and go to `notes.md`.
- Record settled policies and tradeoffs as neutral Decision statements. Do not copy dialogue or add conversational speaker labels and dates; keep technical literals and required responsibilities explicit. Record formal approval authority and provenance separately under the owner gate.

## Contract

- Create the change with `grace5 init <id>`; the id must be new, open or closed. A pin refusal means the state is behind the kernel: run `grace5 upgrade` first; `upgrade.md` names the ways out when a step touches an open change. Write `contract.xml` to `schemas/contract.xsd`: eight sections in fixed order, described in `method.md`.
- State the behavioural delta once, in Change. Cite a standing rule by path in `rule`; never recopy its text. No tasks, no sequence, no pre-written code.
- Affected names what may be written, and Protected what must not be (`authorization.md`).
- Never bump the version or pin or register migration boundaries or rows; a release is a separate owner-requested act (`upgrade.md`).
- Make each check decisive: it must fail if the behaviour is broken. `grace5-review` states the question every required check is judged by; write checks that survive it.
- A check decides between candidates only on the candidate's own bytes. Where its result depends on an excluded input — the installed `grace5-*` skills or anything else under a kernel-managed path — it cannot: state it as installation health, re-evaluated afresh at handoff (`source-identity.md`, `upgrade.md`), not as candidate evidence. Binding such an input into evidence needs a bounded fingerprint under its own approved contract; do not hash caches or the state directory.
- Choose Automated when a project command's exit status separates working from broken. Choose Trace over Manual whenever the behaviour leaves ordered lines in a log a command can capture, because the kernel then checks sequence and provenance itself (`trace-provenance.md`). Keep Manual for what only a person can judge, and declare its Environment.
- A check that is red before the work starts is fine, and is often the reason for the change.
- Run `grace5 check <id>` and clear every `defect:` line. Size is reported, not enforced; explain an excess to the brief writer.

## Brief

Hand the contract, without the conversation, to an independent subagent that never saw it. Give it exactly this task:

> Write the owner's brief for GRACE 5 change `<id>` revision `<rev>`. You may read `.grace5/changes/<id>/contract.xml`, the GRACE 5 method documents (`brief.md` first), `templates/brief.html`, and the repository read-only to confirm cited paths. You may run `grace5 check <id>` for the contract hash, word count and check count. Read no notes and ask for no background; the contract must stand alone. Write one file, `.grace5/changes/<id>/records/brief-<rev>.html`, by filling the template as `brief.md` requires, with `grace5:writer` set to `independent`. Edit nothing else. Return the mechanical findings `brief.md` names (a criterion its check cannot plausibly serve, an undefined term, a contradiction, a boundary that does not cover the Change, a cited path that does not exist), each with the element id it concerns, or state that there are none. Do not propose designs.

- Resolve every finding in the contract, or answer it. Then send the same subagent the corrected contract and your resolutions, and have it bring the brief up to that text with each finding marked resolved.
- Run `grace5 check` again; the owner reads nothing while it reports a defect.
- Without subagents, write the brief yourself from the contract alone, set `grace5:writer` to `self`, and tell the owner so.

## Owner gate

- Give the owner the brief page. They answer in one statement: approve, or reject with the reason.
- Record it in `records/approval-<rev>.xml` (`schemas/approval.xsd`): the decision, date, contract and definition hashes exactly as `grace5 check` prints them, and the SHA-256 of the brief's bytes as the owner read it, taken with a system hash tool. A rejection carries its reason in `Statement`. Omit personal attribution and conversation excerpts; compute nothing else by hand.
- Never set or infer an approval. `authorization.md` says which words count and how a rejection is recorded. An approval authorizes execution; new records carry neither `executes` nor `Execution`. An approval worded to defer the start, such as "approved, hold", remains an approval: wait until the owner starts the change or a batch, and record no hold state.

## Material revision

Once a revision has an approval or a rejection, any edit to `contract.xml` is a material revision (`authorization.md`): increment `revision`, never reuse a rejected number, rerun `grace5 check`, and request a difference brief by adding to the task text: "This is a difference brief against revision `<previous>`; follow the difference rules of `brief.md`." Then pass the owner gate again. What may run meanwhile is in `authorization.md`.

Next: `grace5-execute`.
