# Upgrade

How a repository takes a newer kernel: the version pin in the state, the refusal that protects state laid out for another version, the migration steps, and the command `grace5 upgrade` that composes them. Nothing outside the kernel is needed; a person at the repository runs three commands and commits.

## The pin

`.grace5/kernel-version` holds the version the state conforms to: one line, the version, ended by a line feed. `init` writes it with the kernel's version when it creates `.grace5/`. Where `.grace5/` exists without a pin, the state is at 0.1.0, the version before the pin existed. The pin is tracked and is excluded from the candidate and the dirty state beside the change directories (`source-identity.md`), so writing it changes no change's candidate: under that rule a change may span kernel versions, its receipts carry the kernel of each run, and `status` names the kernel a counted result was recorded with when it differs from the running one. The rule itself changed at the 0.3.0 to 0.4.0 boundary, and that one boundary is different: 0.3.0 hashed the pin into the candidate, so a tree that carries a pin has one candidate under 0.3.0 and another under 0.4.0. Results and reviews recorded by 0.3.0 on a pinned tree are on an earlier candidate under 0.4.0, do not count, and are rerun and re-reviewed after the upgrade; `status` shows them as `does not count: recorded on an earlier candidate, recorded with grace5 0.3.0`. A tree without a pin, as every repository was before 0.3.0, has the same candidate under both rules and is unaffected. A closed record is read by the rule of the kernel it names: the candidate in a `close.xml` written by 0.3.0 reproduces with the pin included, and the kernel compares no closed change's candidate.

## The refusal

Every command except `status`, `upgrade`, `--help`, `--version`, and `init` on a repository without `.grace5/` refuses when the pin differs from the running kernel or cannot be read as a version, on one line, on standard error, and with exit status 1; `upgrade` refuses the unreadable and the ahead cases too:

| State | Line |
|---|---|
| Behind the kernel | `refused: repository state is at <pin>, kernel is <version>: run grace5 upgrade` |
| Ahead of the kernel | `refused: repository state is at <pin>, kernel is <version>: kernel too old` |
| Unreadable | `refused: repository pin is unreadable: <reason>`, the reason naming the file and what it holds |

`status` never refuses. Its first line, in the single-change form and in the listing, is `kernel: <version>, state: <pin>`, followed by `, run grace5 upgrade` when the state is behind, `, kernel too old` when it is ahead, `state: none` where there is no `.grace5/`, and `state: unreadable (<reason>)` when the pin cannot be read as a version.

A change that is open when the kernel moves ahead of the pin is finished with the new kernel once `upgrade` has run; that is the ordinary case, since no step writes it (across the 0.3.0 to 0.4.0 boundary its 0.3.0 results and review are rerun and redone first, as the pin section says). When a step would write it, `upgrade` refuses and there are two ways out: close the change with the previous kernel, which means running from a checkout at the previous tag, or abandon it.

## Migration steps

A migration step is kernel code for one version boundary whose state layout, ignore lines or skills differ: `from`, `to`, one sentence that describes it, `apply`, `verify`, and two declarations read before anything is written, `touches` and `writes`. The rules:

- Idempotent: applied to state already in the shape of `to`, it changes nothing.
- Self-verifying: `verify` fails loudly, with the reason, when the state is not in the shape of `to`; the chain never continues past an unverified step.
- Every step also refreshes the `grace5-*` skill directories wherever they already exist under `.agents/skills/` or `.claude/skills/`, from the kernel's packaged skills, mirroring each packaged skill directory in place, and creates no new location. A `grace5-*` directory the kernel does not package is left alone. The step reports `refreshed: <path>` per directory, or `skills: none installed`.
- Declared writes: `touches` returns the change ids, open or closed, whose directories the step would write in this repository; `writes` returns the source paths outside the change directories whose bytes the step and its skill refresh would change, computed against the repository as it stands, the installed skill files by comparing their bytes with the packaged ones. A step never writes a change it did not declare.
- A boundary between two versions without a step is a pin bump: nothing but the pin changes.

| Step | Does | Touches | Writes |
|---|---|---|---|
| 0.1.0 to 0.2.0 | Moves every change directly under `.grace5/changes/` that carries `records/close.xml` to `.grace5/changes/closed/<id>/`, logs included, and appends the line `.grace5/changes/closed/*/records/logs/` to the repository's `.gitignore` when absent, creating the file if there is none. | The closed siblings it moves. | `.gitignore` when the line is absent; the installed skill files that differ. |
| 0.2.0 to 0.3.0 | Writes the pin. | None. | The installed skill files that differ. |
| 0.3.0 to 0.4.0 | Refreshes the installed skills to 0.4.0: nothing beyond the refresh every step performs, since 0.4.0 changed the skills and nothing else in the state; verifies that every installed `grace5-*` skill file equals the packaged one. | None. | The installed skill files that differ. |

A kernel change that alters the state layout, the ignore lines or the skills ships its step in the same change, and the conformance list gains a case for it.

## The three kinds of write

An upgrade writes three kinds of path, and the open changes decide what it may do with each:

| Kind | Paths | With changes open |
|---|---|---|
| A change directory | What a step's `touches` declares: today the closed siblings the 0.1.0 to 0.2.0 step moves. | An open change is never written. If a step declares an open change, `upgrade` refuses with no override. |
| The pin | `.grace5/kernel-version`. | Outside the candidate and the dirty state; it changes no evidence and needs no permission. |
| Source | Every other path a step or the skill refresh writes outside the change directories: today the ignore line in `.gitignore` and the installed `grace5-*` skill files. | A source write changes the candidate, which makes the evidence of every open change history (`source-identity.md`). It is refused unless `--accept-evidence-loss` is given. |

## The command

`grace5 upgrade` refuses, on one line on standard error and with exit status 1, in this order: `not a git repository`; `repository pin is unreadable: <reason>`; `.grace5/ does not exist: run grace5 init`; `repository state is at <pin>, kernel is <version>: kernel too old` when the pin is ahead. When the pin equals the kernel's version it prints `up to date: <version>` and exits 0. Otherwise it composes the chain from the pinned version to the kernel's version, reads the open changes, those directly under `.grace5/changes/` without `records/close.xml`, and asks every step of the chain what it would write. If any step's `touches` names an open change, it refuses `open changes touched by step <from> -> <to>: <id>, <id>`, naming the first such step and the open ids it declares; no flag overrides this. Then it takes the union of every step's `writes`; if changes are open, the union is not empty and `--accept-evidence-loss` was not given, it refuses `open changes present; the upgrade would write: <path>, <path>`. Every refusal comes before anything is written, with or without `--plan`.

It then prints the plan, one line per link: `step: <from> -> <to>: <description>` for a step, `bump: <from> -> <to>: no step for this boundary, the pin advances` for a bump; then `writes: <path>` per path in the union, and `open, untouched: <id>, <id>` when changes are open. With `--plan` it stops there and writes nothing. Otherwise, when a source write was pending while changes are open and `--accept-evidence-loss` was given, it prints `evidence of open changes becomes history: <id>, <id>`, which names the cost the flag accepts and is what the candidate rule already makes true of any source write; with nothing to write the flag changes nothing and the line is not printed. It reads every change in both locations, as `check` reads them, and then applies the links in order: each step is applied, the skills are refreshed, the step is verified, and the pin is written and reported as `pinned: <version>`. The first failure stops the upgrade with `failed: <from> -> <to>: <reason>`, exit status 1, and the pin at the last completed version, so the repository is at a consistent version and a later `upgrade` resumes from there.

After the chain, every change in both locations is read again, the open ones like every other. The upgrade fails with `failed: post-upgrade check: <id>: <what>` if any change is missing or new, reports a contract or definition hash other than before, or reports a defect it did not report before; a defect that was there before the upgrade is not the upgrade's. Otherwise it prints `checked: <id>` per change and ends with `upgraded: <from> -> <to>`, exit status 0.

`--accept-evidence-loss` is a flag of `upgrade` only; on any other command it is a usage error. `upgrade` never downgrades and takes no target version: the target is always the running kernel's version. It takes no change id.

## At a repository

1. `grace5 status`: the first line says whether the state is behind the kernel and names the command.
2. `grace5 upgrade --plan`: the steps the chain will apply, in plain words, the source paths it would write and the open changes it leaves untouched.
3. `grace5 upgrade`: applies them; the output ends with `upgraded: <from> -> <to>`. A refusal naming a step and an open change means that change is closed with the previous kernel, from a checkout at the previous tag, or abandoned; a refusal naming paths means the open changes' evidence would become history, and `--accept-evidence-loss` accepts that.
4. Commit the result: the pin, the moved changes, the ignore line and the refreshed skills.
