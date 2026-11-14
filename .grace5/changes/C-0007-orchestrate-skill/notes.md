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

## Execution, 2026-11-14

- The owner approved revision 1 with "I approve" after receiving `records/brief-1.html`; the verbatim statement and the check/brief hashes are in `records/approval-1.xml`. Work is on `master` as D10 authorizes. The starting source tree is clean; C-0006 and C-0008 are closed.
- C-0008 already introduced version 0.6.0, the 0.5.0 to 0.6.0 skills-refresh step and the repository pin. Extend that step with the orchestrator installation rather than adding a second boundary or reverting C-0008's approval semantics. The version and pin need no rewrite.
- Tag `v0.6.0` already exists before this change starts. Do not move or overwrite an existing tag; report this delivery limitation to the owner when the change reaches closure.
- Subsequent owner instruction in this conversation: "do not bump global version or install it on the machive without my request or approval. NOT any change result in a new version of the framework. Creating a new version and installing it must be an explicit user request". Releases and machine installation are separate owner-requested actions, never consequences of implementing or closing a change. This instruction supersedes D10's proposed tagging at close: retain the already-existing 0.6.0 version and tag, create no release and perform no machine-wide installation. The approved E1 fixture uses only isolated scratch copies of the packaged skills.
- Mechanical test updates, fixture setup and packaging generation are delegated as AGENTS.md requires. The lead authors the skill, kernel behavior and method documentation, verifies the resulting diff and commits with the change trailer.
- Run 1 is the clean start at `bdb771b8f946a55c12694d116333921ebf5c14a2`: CK1, CK2, CK3, CK4 and CK6 passed; CK5 failed because the orchestrator package did not exist. No `Preexisting` source path was recorded. The full suite took about eight minutes on this Windows host.
- Run 2 is dirty iteration evidence: CK1, CK3, CK5 and CK6 passed; CK4 caught a late skill wording change missing from the generated packages. Regeneration resolved it; the failed receipt is preserved.
- Targeted upgrade tests (UP-03, UP-07, UP-19 and AUTH-03) pass, as do type checking, package verification and contract validation. UP-19 exercises install/no-install boundaries, missing and drifted copies, once-versus-twice stability and unchanged open-change hashes, receipt bytes, candidate and counted evidence.
- The fourth rehearsal fixture uses a rejected approval rather than legacy `executes="false"`: C-0008 now ignores that field, so only a non-approved current revision demonstrates exclusion faithfully. No actual contract or approval is changed for this fixture choice.
- Implementation source commit: `e3fe433c18351d86771955d6c1567c38bb1f40a5`; source candidate: `0537fd4b3bd9d8aca1211422e4b3c8d77cd01f926df01d5330cd6d06166270ba`. Run 3 executed the full approved selection on that clean candidate: CK1 through CK6 all passed. The suite ran 89 tests (one skipped), with zero failures and 1377 assertions, in about eight minutes. CK7 remains unobserved; review and closure wait for the owner's observation.
- CK7 fixture repository: `D:/cache/uv/grace5-c0007-rehearsal/fixture/grace5-conf-uVd0g7/repo`, initialized by the candidate kernel with four packaged skills. Its pre-run baseline is `5ec671374b9a4b30c93344b6980b3a0fa1741614`. A fresh subagent received only the repository path and instruction to run its open changes with the installed orchestrator skill. The run and its evidence remain outside this governed repository.

## Preparation history

- At preparation C-0006-kernel-managed-paths was open at `next: close`; it has since closed, so that worktree concern no longer applies.
- Fix-round bound default: two rounds, then park. Dispatch deadline default: stated by the orchestrator in the ledger per dispatch, from the sum of the change's check budgets.
