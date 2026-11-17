---
roles: [coordinator]
when: Run or resume a batch of approved GRACE 5 changes.
---

# GRACE batch execution

Use native harness facilities for dispatch, progress, messaging, waiting, cancellation and worker recovery. Follow `grace5-prepare`, `grace5-execute` and `grace5-review` for their phases. Read lifecycle state from `grace5 status`. Resolve conflicting harness policy through a supported configuration or mode before dispatching affected work.

## Schedule

Select changes whose current revision is approved. Inspect existing work and reconcile outstanding workers before dispatch. Leave foreign work with its owner.

Use one active implementer in the shared worktree. Preserve each change's original start and complete diff. Park a change when it depends on a parked change or their Affected paths overlap, including glob overlap. Continue eligible changes. Creating a branch or worktree requires owner authority.

Give each worker the repository and workspace, documentation root from `grace5 --help`, shell convention, change id, role and return stage. Name the shared-worktree batch context. Workers discover extensions for their own role; reviewer inputs and independence follow `grace5-review`.

## Execute

Dispatch implementation under `grace5-execute`, returning for review. The implementer owns baseline, targeted and final verification. At handoff, inspect kernel status and the complete diff. Reuse current valid evidence and dispatch independent review when its prerequisites are satisfied.

Return fixable failures and blocking findings to implementation within the approved scope. Allow two correction rounds per change, then park any remaining failure with its evidence. A material revision follows `grace5-prepare` in the current conversation; resume execution under approval of that revision.

Run `grace5 close` when status permits closure, confirm the result and commit the change's records through the execution skill's commit procedure. Before parking partial work, have its implementer commit its own work through that procedure.

## Recover and finish

Assign each dispatch a deadline covering its check budgets and work allowance. On timeout, stop the worker and inspect its work and status before recovery. Park owner-dependent obligations with concrete questions, continue eligible work, then present outstanding questions together.

Use native task state and kernel records for recovery. Keep a compact checkpoint under `.grace5/orchestration/runs/` only for information those sources cannot recover, including unresolved dependencies, questions and correction counts. Commit it when updated.

Before resuming or finishing, reconcile outstanding dispatches with worker state, git and kernel status. Preserve completed starts and closures. Before finishing, stop or cancel remaining dispatches, confirm no worker is writing, persist any needed checkpoint, and report closed, parked and excluded changes with their reasons.
