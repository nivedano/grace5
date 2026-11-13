# Notes for C-0007-orchestrate-skill

Never approved; sequence and technical detail only.

## Source material

- The GRACE 4 skill `orchestrate-change-batch` (nodus `skills/orchestrate-change-batch/SKILL.md`, the mtext and omeyocan variants) is reference for what a run needs, not text to copy. Carried over as ideas: the orchestrator never implements; the ledger is the run's memory and the resume point; a deadline on every dispatch; one completion check; a red-flags list. Left to policy: checkpoints (deploys, device installs), build-substrate rules, pushes, token accounting, the graph helper.
- The sysops skill `agent-runs` (containerised workers) is the example an extension file must be able to express without the kernel naming containers.

## Sequence

1. `run --start`.
2. `models/architecture/method.md`: one section, Local extensions (the folder `.grace5/extensions/`, optional, prose, one topic per file, each naming the roles it addresses, never read by the kernel, what an extension may and may not grant); surface table rows. No topic document (owner's steer of 2026-11-13: instructions shared by all skills in a well-known folder, no heavier infrastructure). One sentence on extensions in each of the three lifecycle skills.
3. `skills/grace5-orchestrate/SKILL.md`: the procedure, the critical classes, the ledger's fields, resume and the completion check. Stages: orient (status, foreign work, extensions), take and leave out, per change (start, implementer, verify by status, final evidence, reviewer, fix rounds, close, commit), park, question round, completion.
4. Kernel: step 0.5.0 to 0.6.0 in `src/upgrade/steps.ts` (install `grace5-orchestrate` in each location under `SKILL_LOCATIONS` that holds at least one packaged skill; verify the directory equals the package there; `touches` none); a helper beside `refreshSkills` in `src/upgrade/skills.ts`. `packagedSkillNames` already reads the names from `packages/skills/`, so the candidate exclusion follows without code.
5. Conformance: a new UP case for the install (beside an installed skill in one location, none in the other; twice; no location created), UP-03 plan line, `upgrade-verify.ts` expected lines; `conformance.md` row.
6. Documents: `method.md` surface table (skills, documents), `source-identity.md` name list, `upgrade.md` step table, `rationale-ledger.md` L-24, `README.md`, `AGENTS.md` ("the three skills").
7. Version 0.6.0 in `package.json`, `bun run package`, pin by `upgrade` in this repository.
8. Rehearsal for CK7: scratch repository under the system temp directory, four changes as E1 says, approvals recorded there by the author as fixtures of the scratch repository (they are test data, not approvals of anything real; say so in the scratch README), one extension file `commits.md` with the trailer rule, a fresh subagent as the orchestrating session. The owner reads the ledger and report; record the observation in the owner's words.

## Open points

- C-0006-kernel-managed-paths is open in this worktree at `next: close`, with an untracked `review-1.xml` this session did not write. Do not touch it; C-0007's start run will not list it (kernel-managed path). Starting C-0007 before C-0006 closes puts two changes in one worktree; ask the owner at the go-ahead.
- Fix-round bound default: two rounds, then park. Dispatch deadline default: stated by the orchestrator in the ledger per dispatch, from the sum of the change's check budgets.
