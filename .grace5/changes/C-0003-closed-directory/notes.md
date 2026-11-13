# Notes: C-0003-closed-directory

Sequence and technical detail of the execution. The behaviour is in `contract.xml`; the documents it amends are cited there.

## Kernel

- `src/state.ts`: `locateChange(root, id)` resolves `.grace5/changes/<id>/` first and `.grace5/changes/closed/<id>/` second; `evaluate` reads the located directory and carries `path` and `inClosedDir`. Two layout defects make a change malformed: a directory under `closed/` without `records/close.xml` (`CLOSE_RECORD_MISSING`, the phrase names the missing close record) and an id with a directory in both places (the open one is read). `listChanges` excludes the `closed` entry; `listClosedChanges` lists the moved ones. `selectChange` resolves a named id or bare number across both locations; the unnamed selection still picks the single open sibling.
- `src/commands/close.ts`: after `writeRecord` of `close.xml`, `renameSync` of the change directory into `closed/` (created on demand). A failed rename prints `not moved: <reason>` on standard error and the `closed:` line carries the actual path; exit stays 0 because the record exists.
- `src/commands/status.ts`: the listing walks both locations in id order, prints open changes as before, defers closed lines, then prints `<id>: closed` per closed change when `--all` is given and the malformed-under-`closed/` lines, and last `closed changes: <n>`. A malformed change is never counted.
- `src/commands/init.ts`: a located id refuses with `refused: change <id> exists at <path>/` before anything is written; the README template names `changes/closed/`.
- `src/cli.ts`: `--all` is parsed for `status` only and is a usage error with a change id; help text of the overview, `init`, `status` and `close` amended; `cli-reference.md` regenerated from it.
- `src/git.ts` unchanged: `CHANGES_DIR` already covers `closed/`.

## Conformance

- `src/conformance/closed.test.ts`: CL-01 to CL-05. The helper's `changeDir` resolves the closed location once the open one is gone, so the existing tests that read `close.xml` after a close keep working; `openChangeDir` and `closedChangeDir` are explicit.
- The unmoved sibling of CL-02 and CL-05 is produced by closing with the kernel and renaming the directory back by filesystem, which is what a pilot repository looks like before it takes this version.
- Verified that all five fail against the kernel before this change (kernel sources stashed, tests kept): 0 pass, 5 fail.

## Documents and packaging

- `commands.md` gains "Where a change lives"; `evidence-records.md`, `source-identity.md`, `method.md`, `m2-proposal.md`, `conformance.md`, `rationale-ledger.md` (L-22), both READMEs and the prepare and execute skills amended as the contract lists.
- `package.json` 0.2.0, `bun run package` regenerates `packages/` and `cli-reference.md`; `.gitignore` ignores logs under `closed/`.

## Restructuring this repository

- `C-0001-kernel` and `C-0002-pilot-readiness` moved with `git mv` in a records-only commit; their untracked `records/logs/` moved by filesystem.
