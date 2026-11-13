# Upgrade

How a repository takes a newer kernel: the version pin in the state, the refusal that protects state laid out for another version, the migration steps, and the command `grace5 upgrade` that composes them. Nothing outside the kernel is needed; a person at the repository runs three commands and commits.

## The pin

`.grace5/kernel-version` holds the version the state conforms to: one line, the version, ended by a line feed. `init` writes it with the kernel's version when it creates `.grace5/`. Where `.grace5/` exists without a pin, the state is at 0.1.0, the version before the pin existed. The pin is an ordinary tracked file and therefore source (`source-identity.md`); because `upgrade` refuses while any change is open, a pin change can never invalidate a change's evidence.

## The refusal

Every command except `status`, `upgrade`, `--help`, `--version`, and `init` on a repository without `.grace5/` refuses when the pin differs from the running kernel, on one line and with exit status 1:

| State | Line |
|---|---|
| Behind the kernel | `refused: repository state is at <pin>, kernel is <version>: run grace5 upgrade` |
| Ahead of the kernel | `refused: repository state is at <pin>, kernel is <version>: kernel too old` |

`status` never refuses. Its first line, in the single-change form and in the listing, is `kernel: <version>, state: <pin>`, followed by `, run grace5 upgrade` when the state is behind, `, kernel too old` when it is ahead, and `state: none` where there is no `.grace5/`.

## Migration steps

A migration step is kernel code for one version boundary whose state layout, ignore lines or skills differ: `from`, `to`, one sentence that describes it, `apply`, and `verify`. The rules:

- Idempotent: applied to state already in the shape of `to`, it changes nothing.
- Self-verifying: `verify` fails loudly, with the reason, when the state is not in the shape of `to`; the chain never continues past an unverified step.
- Every step also refreshes the `grace5-*` skill directories wherever they already exist under `.agents/skills/` or `.claude/skills/`, from the kernel's packaged skills, mirroring each packaged skill directory in place, and creates no new location. A `grace5-*` directory the kernel does not package is left alone. The step reports `refreshed: <path>` per directory, or `skills: none installed`.
- A boundary between two versions without a step is a pin bump: nothing but the pin changes.

| Step | Does |
|---|---|
| 0.1.0 to 0.2.0 | Moves every change directly under `.grace5/changes/` that carries `records/close.xml` to `.grace5/changes/closed/<id>/`, logs included, and appends the line `.grace5/changes/closed/*/records/logs/` to the repository's `.gitignore` when absent, creating the file if there is none. |
| 0.2.0 to 0.3.0 | Writes the pin. |

A kernel change that alters the state layout, the ignore lines or the skills ships its step in the same change, and the conformance list gains a case for it.

## The command

`grace5 upgrade` refuses, on one line and with exit status 1: `not a git repository`; `.grace5/ does not exist: run grace5 init`; `open changes: <id>, <id>` while any change directly under `.grace5/changes/` has no `records/close.xml` (the owner closes or waits); `repository state is at <pin>, kernel is <version>: kernel too old` when the pin is ahead. When the pin equals the kernel's version it prints `up to date: <version>` and exits 0.

Otherwise it composes the chain from the pinned version to the kernel's version and prints it as the plan, one line per link: `step: <from> -> <to>: <description>` for a step, `bump: <from> -> <to>: no step for this boundary, the pin advances` for a bump. With `--plan` it stops there and writes nothing. Otherwise it reads every change in both locations first, as `check` reads them, and then applies the links in order: each step is applied and verified, the skills are refreshed, and the pin is written and reported as `pinned: <version>`. The first failure stops the upgrade with `failed: <from> -> <to>: <reason>`, exit status 1, and the pin at the last completed version, so the repository is at a consistent version and a later `upgrade` resumes from there.

After the chain, every change in both locations is read again. The upgrade fails with `failed: post-upgrade check: <id>: <what>` if any change is missing or new, reports a contract or definition hash other than before, or reports a defect it did not report before; a defect that was there before the upgrade is not the upgrade's. Otherwise it prints `checked: <id>` per change and ends with `upgraded: <from> -> <to>`, exit status 0.

`upgrade` never downgrades and takes no target version: the target is always the running kernel's version. It takes no change id.

## At a repository

1. `grace5 status`: the first line says whether the state is behind the kernel and names the command.
2. `grace5 upgrade --plan`: the steps the chain will apply, in plain words.
3. `grace5 upgrade`: applies them; the output ends with `upgraded: <from> -> <to>`.
4. Commit the result: the pin, the moved changes, the ignore line and the refreshed skills.
