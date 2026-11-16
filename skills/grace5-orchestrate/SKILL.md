---
name: grace5-orchestrate
description: Use when several approved GRACE 5 changes should run in one mostly unattended session, through implementer and independent reviewer subagents, or when such a run must resume from its ledger.
---

# Orchestrate approved GRACE 5 changes

File names below refer to the GRACE 5 method documents: `models/architecture/` in the GRACE 5 repository, elsewhere those shipped with the package. Read `method.md`; use `grace5-prepare`, `grace5-execute` and `grace5-review` for their lifecycle mechanics rather than reconstructing them here.

Before working, read the repository's optional `.grace5/extensions/` files and follow those addressed to your role (`method.md`, Local extensions).

You coordinate; you write no product files. Implementers follow `grace5-execute`; reviewers follow `grace5-review` independently of the authoring conversation. Read the state of every change from `grace5 status`, never from a subagent's report. You run `grace5 close` when status names no other obligation. Never manufacture or edit kernel receipts, approvals or close records; the reviewer authors its review record as its skill requires. Preparation and owner decisions are outside the run. Ordinary changes never bump versions or pins or register migration boundaries or rows; a release is a separate owner-requested act (`upgrade.md`).

## Orient and record the run

- Read the repository's working rules and extensions before selecting changes. Pass the extension-reading obligation and the repository location to every subagent. An extension may replace the defaults below, add critical classes or grant standing authority for outward-facing actions; it grants none of the owner gates the kernel reserves (`authorization.md`, `evidence-records.md`).
- Default to one change at a time in the current worktree, in id order, each closed or parked before the next starts, under the serial-batch isolation exception in `method.md` and the complete-diff rule in `source-identity.md`. Give every implementer that batch context; retain each change's original start and record which change owns each commit. Do not create a branch or worktree. Concurrency and isolated workspaces exist only where an extension provides and authorizes them; otherwise keep the default. Never share one worktree between active implementers.
- Run `grace5 status`, then `grace5 status <id>` for every open change. Take only those whose current revision reports `authorization: approved`. List every other open change as left out, with the exact reason, including a malformed change. A version refusal follows `grace5-execute`'s recovery, without silently changing an approved contract.
- Inspect dirty paths before dispatch. Identify ownership from git and the ledger, never from an assumption. Uncommitted work the run did not make inside a change's Affected paths is a critical stop for that change. Leave foreign work alone wherever it is; never stage, stash, commit or tidy it.
- Keep a prose run ledger under `.grace5/orchestration/runs/`. Choose a distinct file for a new run; resume the existing ledger when recovering. No ledger format is a kernel record or a schema. Record the worktree, starting revision, taken and left-out changes with reasons, relevant extensions and authority, observed dirty paths and ownership, dependencies, each change's current stage, last status/candidate, dispatches and their deadlines, fix-round count, decisions, commits, and parked questions. Write a decision before acting on it and update the ledger after every handoff and status read. A fresh session must be able to continue from it without this conversation.

## Carry each taken change

1. Read its contract and status. A later change depends on a parked one if its contract names that change or if their Affected path lists share a path. Read globs as paths they cover, not just equal strings; uncertainty about an overlap is not independence. Park a dependent change as waiting, naming what it waits for. Continue with the next independent change.
2. Dispatch an implementer with the change id, repository/workspace, `grace5-execute`, and the instruction to read the extensions for its role. Tell it to return for review, not to close or review its own implementation. It returns critical needs to you, without asking the owner separately or recording an owner decision. The lifecycle skill governs start and recovery; never dispatch a second start for a change already started.
3. Give every dispatch a deadline, recorded in the ledger before dispatch: allow the sum of its check budgets plus an explicit implementation or review allowance. Monitor the worker against it. At expiry stop the worker, inspect git and `grace5 status`, and record the unfinished obligation; recover or redispatch through the lifecycle skill, without inventing a receipt or treating a timeout as success.
4. On return, inspect its diff and read `grace5 status <id>` yourself. Resolve routine choices and return incomplete work or a failed required check to the implementer inside the approved contract. Record each fix round: one return to the implementer to correct the product inside that contract. The default limit is two fix rounds per change, shared by check failures and blocking review findings; an extension may set another number. Never fix the code yourself or bend a check to pass it.
5. Final evidence and owner observations belong to `grace5-execute`. If status names an owner gate, park the change. When status names review, dispatch an independent reviewer with exactly the inputs `grace5-review` specifies, no authoring conversation, explanation of intent or hints about findings. The reviewer reads the extensions for its role, writes the review record, reports findings and approves nothing.
6. Read status after review. Return a blocking finding that can be corrected within the approved contract to the implementer while fix rounds remain, then repeat final evidence and independent review as their skills require. A boundary, constraint or check amendment needs the owner gate, not another attempt to reinterpret the approved text.
7. Once status names closure, run `grace5 close <id>` yourself and read status again to confirm the result. A refusal is the next obligation, never permission to write a record by hand. Commit only the run's own records and move, using the change trailer required by `grace5-execute` and any extension trailers. Record the closing commit and continue.

## Critical stops and the question round

Park a change in the ledger with its status, the precise unmet obligation and one actionable question when any of these applies:

- A gate the kernel reserves for the owner: approval of a material revision, a manual observation, or an owner-disposed finding. Infer none from an extension, an instruction to run unattended or a subagent's report.
- Uncommitted work the run did not make inside that change's Affected paths.
- An outward-facing or irreversible action without standing authority, including a push, deploy, or creation of a branch or worktree. Read the authority before acting; the run itself grants none.
- A failed required check or blocking finding remains after the allowed fix rounds. Record the attempts and the remaining failure.
- Any additional critical class an extension states. An extension cannot remove an owner gate the kernel reserves.

Every other decision is yours, recorded in the ledger. Do not interrupt the owner as each change parks. Before moving on, have the implementer commit its own partial work under `grace5-execute`; do not fold it into another change's commit. Continue with every later change that does not depend on a parked one, recording waiting changes separately from critical stops. When nothing else can move, commit the run ledger and the run's own records, then give the owner all parked questions together in one round, with the evidence they need to answer. Include the left-out changes and reasons, and which changes closed. Never present parked work as completed.

## Resume and finish

Read the ledger, repository rules and extensions again, inspect git, and rerun status for every recorded change, including closed ones. Reconcile dispatches that outlived the session before starting another worker. Status takes precedence over the ledger and every report: adopt no unknown dirty work, infer no observation or approval, and do not repeat a completed start or close. Apply only owner answers actually received; a material revision returns to `grace5-prepare` outside this run until approved. Later source commits can stale a parked change's evidence; `grace5-execute` governs the rerun on resumption.

Before ending, reconcile every dispatch against its handback, ledger entry and current worker inventory. Stop or cancel any outstanding pending or running dispatch, including a retained pending dispatch after a handback, and record the result; do not leave a dispatch able to start later. An unresolved dispatch is unfinished work, so do not claim the run finished while one remains. Then perform one completion check against status: every taken change is kernel-closed or parked with a critical question or a named dependency; every other open change is listed as left out with its reason; no pending or running dispatch remains and no worker is still writing; every decision, fix round, cancellation and commit is in the ledger; and the ledger is committed. Report any unfinished obligation explicitly. Do not push, deploy, create a branch or worktree, or dispose an owner gate merely to finish the run.
