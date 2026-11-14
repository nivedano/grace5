# Upgrade

How a repository takes a newer kernel: the version pin in the state, the refusal that protects state laid out for another version, the migration steps, and the command `grace5 upgrade` that composes them. Nothing outside the kernel is needed; a person at the repository runs three commands and commits.

## Versions are releases

A version marks a release, not a change. The owner asks for a release explicitly, and only that request creates a version: no change, no agent and no command does it by itself. Between two releases any number of changes may close, and they carry the version of the last release. `package.json`, this repository's README status line and `.grace5/kernel-version` name the last release until the next one; a change that is not a release leaves all three and the migration table untouched.

A release is a version this repository tags `v<version>`; the previous release is the nearest earlier such tag. A release is one change, requested by the owner, that carries the closed changes since the previous release and does all of the following together: sets the version in `package.json` and in the README status line, adds one migration step for each version boundary it crosses whose state layout, local ignore file or skills differ, writes the pin, and verifies an upgrade from the previous release's tag on a clone that carries one open change. Its brief names the changes it carries.

Consequences for a change: it does not bump the version, the pin or a step, and it does not add a row to the migration table. A reviewer writes a blocking finding when a change that is not a release does any of these, and the prepare and execute skills say the same. This is the owner's ruling of 2026-11-14 (`rationale-ledger.md` L-25).

## The pin

`.grace5/kernel-version` holds the version the state conforms to: one line, the version, ended by a line feed. `init` writes it with the kernel's version when it creates `.grace5/`. Where `.grace5/` exists without a pin, the state is at 0.1.0, the version before the pin existed. The pin is tracked and, like everything under `.grace5/`, is a kernel-managed path outside the candidate and the dirty state (`source-identity.md`), so writing it changes no change's candidate: under that rule a change may span kernel versions, its receipts carry the kernel of each run, and `status` names the kernel a counted result was recorded with when it differs from the running one. The rule itself has changed at two boundaries, and those two are different. 0.3.0 hashed the pin into the candidate, so a tree that carries a pin has one candidate under 0.3.0 and another under 0.4.0; a tree without a pin, as every repository was before 0.3.0, has the same candidate under both rules and is unaffected. 0.4.0 hashed `.grace5/README.md` and the installed skills into the candidate, so every repository the kernel initialised, this one included, has one candidate under 0.4.0 and another under 0.5.0 for the same tree, since `.grace5/README.md` alone makes the difference. Results and reviews recorded by the earlier kernel on such a tree are on an earlier candidate under the later one, do not count, and are rerun and re-reviewed once after the upgrade; `status` shows them as `does not count: recorded on an earlier candidate, recorded with grace5 <version>`. A closed record is read by the rule of the kernel it names: the candidate in a `close.xml` written by 0.3.0 reproduces with the pin included, one written by 0.4.0 with the entry point and the installed skills included, and the kernel compares no closed change's candidate.

## The refusal

Every command except `status`, `upgrade`, `--help`, `--version`, and `init` on a repository without `.grace5/` refuses when the pin differs from the running kernel or cannot be read as a version, on one line, on standard error, and with exit status 1; `upgrade` refuses the unreadable and the ahead cases too:

| State | Line |
|---|---|
| Behind the kernel | `refused: repository state is at <pin>, kernel is <version>: run grace5 upgrade` |
| Ahead of the kernel | `refused: repository state is at <pin>, kernel is <version>: kernel too old` |
| Unreadable | `refused: repository pin is unreadable: <reason>`, the reason naming the file and what it holds |

`status` never refuses. Its first line, in the single-change form and in the listing, is `kernel: <version>, state: <pin>`, followed by `, run grace5 upgrade` when the state is behind, `, kernel too old` when it is ahead, `state: none` where there is no `.grace5/`, and `state: unreadable (<reason>)` when the pin cannot be read as a version.

A change that is open when the kernel moves ahead of the pin is finished with the new kernel once `upgrade` has run; that is the ordinary case, since no step writes it and nothing a step writes is in its candidate (across the 0.3.0 to 0.4.0 and the 0.4.0 to 0.5.0 boundaries its earlier results and review are redone first, as the pin section says). When a step would write it, `upgrade` refuses and there are two ways out: close the change with the previous kernel, which means running from a checkout at the previous tag, or abandon it.

## Migration steps

A migration step is kernel code for one version boundary whose state layout, local ignore file or skills differ: `from`, `to`, one sentence that describes it, `apply`, `verify`, and one declaration read before anything is written, `touches`. The rules:

- Idempotent: applied to state already in the shape of `to`, it changes nothing.
- Self-verifying: `verify` fails loudly, with the reason, when the state is not in the shape of `to`; the chain never continues past an unverified step. Both `apply` and `verify` receive the packaged skills directory the refresh uses, so a step that installs skills or counts them as part of its shape uses the same files.
- Every step also refreshes the `grace5-*` skill directories wherever they already exist under `.agents/skills/` or `.claude/skills/`, from the kernel's packaged skills, mirroring each packaged skill directory in place, and creates no new location. The 0.5.0 to 0.6.0 step first installs `grace5-orchestrate` beside any existing packaged skill in each such location. A `grace5-*` directory the kernel does not package is left alone. The step reports `refreshed: <path>` per directory, or `skills: none installed`.
- Declared writes: `touches` returns the change ids, open or closed, whose directories the step would write in this repository. A step never writes a change it did not declare, and never writes a path that is not kernel-managed (`source-identity.md`): the state directory and the installed skills, and in particular no project file.
- A boundary between two versions without a step is a pin bump: nothing but the pin changes.

| Step | Does | Touches |
|---|---|---|
| 0.1.0 to 0.2.0 | Moves every change directly under `.grace5/changes/` that carries `records/close.xml` to `.grace5/changes/closed/<id>/`, logs included, and writes the local ignore file `.grace5/.gitignore` (below). The kernels 0.2.0 to 0.4.0 appended the line `.grace5/changes/closed/*/records/logs/` to the project's `.gitignore` instead. | The closed siblings it moves. |
| 0.2.0 to 0.3.0 | Writes the pin. | None. |
| 0.3.0 to 0.4.0 | Refreshes the installed skills to 0.4.0: nothing beyond the refresh every step performs, since 0.4.0 changed the skills and nothing else in the state; verifies that every installed `grace5-*` skill file equals the packaged one. | None. |
| 0.4.0 to 0.5.0 | Writes the local ignore file `.grace5/.gitignore` and verifies it carries both lines; nothing else. | None. |
| 0.5.0 to 0.6.0 | Installs `grace5-orchestrate` in every skill location that already holds a packaged skill, and nowhere else, refreshes the installed skills and verifies the orchestrator is present where required and every installed skill matches the package; no change directory or record is written. Legacy approval execution fields are ignored by the kernel. | None. |

A release whose carried changes alter the state layout, the local ignore file or the skills ships the step for the boundary it crosses, and the conformance list gains a case for it. A change that is not a release ships no step, even when it alters the skills.

## The local ignore file

`.grace5/.gitignore` holds two lines, `changes/*/records/logs/` and `changes/closed/*/records/logs/`, each ended by a line feed, so that the run logs of the open and the closed changes stay out of git while the receipts, which carry the logs' hashes, are committed. `init` writes it when it creates `.grace5/`, and the two steps above write it: created with the two lines where it is absent, the lines it lacks appended where it exists, and left alone where it carries both. It is tracked, and inside `.grace5/`, so kernel-managed: writing it changes no candidate. The kernel writes no project file: the kernels 0.2.0 to 0.4.0 appended `.grace5/changes/closed/*/records/logs/` to the project's `.gitignore`, and where that line is found it is left alone; it is redundant beside the local file and may be removed by hand.

## The two kinds of write

An upgrade writes two kinds of path, and the open changes decide what it may do with the first:

| Kind | Paths | With changes open |
|---|---|---|
| A change directory | What a step's `touches` declares: today the closed siblings the 0.1.0 to 0.2.0 step moves. | An open change is never written. If a step declares an open change, `upgrade` refuses with no override. |
| A kernel-managed path | Everything else a step, the pin write or the skill refresh writes: the pin, the local ignore file and the installed `grace5-*` skill directories. | Outside the candidate, the dirty state and the complete diff of every change (`source-identity.md`): it changes no evidence and needs no permission. |

## The command

`grace5 upgrade` refuses, on one line on standard error and with exit status 1, in this order: `not a git repository`; `repository pin is unreadable: <reason>`; `.grace5/ does not exist: run grace5 init`; `repository state is at <pin>, kernel is <version>: kernel too old` when the pin is ahead. When the pin equals the kernel's version it prints `up to date: <version>` and exits 0. Otherwise it composes the chain from the pinned version to the kernel's version, reads the open changes, those directly under `.grace5/changes/` without `records/close.xml`, and asks every step of the chain which change directories it would write. If any step's `touches` names an open change, it refuses `open changes touched by step <from> -> <to>: <id>, <id>`, naming the first such step and the open ids it declares; no flag overrides this. The refusal comes before anything is written, with or without `--plan`.

It then prints the plan, one line per link: `step: <from> -> <to>: <description>` for a step, `bump: <from> -> <to>: no step for this boundary, the pin advances` for a bump; then `open, untouched: <id>, <id>` when changes are open. With `--plan` it stops there and writes nothing. Otherwise it reads every change in both locations, as `check` reads them, and then applies the links in order: each step is applied, the skills are refreshed, the step is verified, and the pin is written and reported as `pinned: <version>`. The first failure stops the upgrade with `failed: <from> -> <to>: <reason>`, exit status 1, and the pin at the last completed version, so the repository is at a consistent version and a later `upgrade` resumes from there.

After the chain, every change in both locations is read again, the open ones like every other. The upgrade fails with `failed: post-upgrade check: <id>: <what>` if any change is missing or new, reports a contract or definition hash other than before, or reports a defect it did not report before; a defect that was there before the upgrade is not the upgrade's. Otherwise it prints `checked: <id>` per change and ends with `upgraded: <from> -> <to>`, exit status 0.

`--plan` is the only flag of `upgrade`; `--accept-evidence-loss`, the flag of 0.4.0, is a usage error on every command, there being no source write left to accept. `upgrade` never downgrades and takes no target version: the target is always the running kernel's version. It takes no change id.

## At a repository

1. `grace5 status`: the first line says whether the state is behind the kernel and names the command.
2. `grace5 upgrade --plan`: the steps the chain will apply, in plain words, and the open changes it leaves untouched.
3. `grace5 upgrade`: applies them; the output ends with `upgraded: <from> -> <to>`. A refusal naming a step and an open change means that change is closed with the previous kernel, from a checkout at the previous tag, or abandoned.
4. Commit the result: the pin, the moved changes, the local ignore file and the refreshed skills. Git lists them; no change's candidate, dirty state or diff does.
