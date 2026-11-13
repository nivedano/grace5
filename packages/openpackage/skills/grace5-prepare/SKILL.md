---
name: grace5-prepare
description: Use when a GRACE 5 change has to be opened or its contract revised, before any execution. Covers the interview, contract.xml, the independent brief, and recording the owner's decision.
---

# Prepare a GRACE 5 change

File names below refer to the GRACE 5 method documents: `models/architecture/` in the GRACE 5 repository, elsewhere the GRACE 5 method documents shipped with the package. `method.md` is the whole method; read it once.

## Interview

- Read the repository and its rule files first. Ask the owner only what is theirs to decide: behaviour, boundary, what is left alone, what evidence they accept, what burden they take on (a bench session, a manual procedure).
- Do not ask procedural questions. Sequence, file choice and technique are yours and go to `notes.md`.
- Every answer that settles something becomes one Decision, in the owner's words.

## Contract

- Create the change with `grace5 init <id>`; the id must be new, since `init` refuses one that exists open or under `.grace5/changes/closed/`. A refusal `repository state is at <pin>, kernel is <version>: run grace5 upgrade` means the state is behind the kernel: run `grace5 upgrade` first, which proceeds past an open change no step writes, and when it refuses because a step touches an open change, that change is closed with the previous kernel (run from a checkout at the previous tag) or abandoned (`upgrade.md`). Write `contract.xml` to `schemas/contract.xsd`: eight sections in fixed order, described in `method.md`.
- State the behavioural delta once, in Change. Cite a standing rule by path in `rule`; never recopy its text. No tasks, no sequence, no pre-written code.
- Affected names what may be written, and Protected what must not be (`authorization.md`).
- Make each check decisive: it must fail if the behaviour is broken. `grace5-review` states the question every required check is judged by; write checks that survive it.
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

- Give the owner the brief page. They answer in one statement: approve, approve and go ahead, or reject with the reason.
- Record it in `records/approval-<rev>.xml` (`schemas/approval.xsd`): the statement verbatim, where it was said, the contract and definition hashes exactly as `grace5 check` prints them, and the SHA-256 of the brief file's bytes as the owner read it, taken with a system hash tool. Compute nothing else by hand.
- Never set or infer an approval. `authorization.md` says which words count, what `executes` means, and how a later go-ahead or a rejection is recorded.

## Material revision

Once a revision has an approval or a rejection, any edit to `contract.xml` is a material revision (`authorization.md`): increment `revision`, never reuse a rejected number, rerun `grace5 check`, and request a difference brief by adding to the task text: "This is a difference brief against revision `<previous>`; follow the difference rules of `brief.md`." Then pass the owner gate again. What may run meanwhile is in `authorization.md`.

Next: `grace5-execute`.
