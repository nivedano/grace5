# Notes of C-0005-upgrade-with-open-changes

Sequence, technical detail and discovered sub-steps. Mutable, never approved.

## Sequence

1. `package.json` 0.4.0 and `.grace5/kernel-version` 0.4.0 first, in the same commit as the first kernel change, so the pin refusal keeps the iteration runs of this change working.
2. `src/git.ts`: `PIN_PATH` beside `CHANGES_DIR`; `isSource` excludes the pin, so the candidate, the dirty paths and the changed-files diff all leave it out. `src/upgrade/pin.ts` re-exports the constant and turns an unreadable pin into the fixed refusal phrase (`unreadablePin`), used by `pinRefusal` in `cli.ts` and by the `upgrade` command.
3. `src/upgrade/steps.ts`: `Step` gains `touches(root)` and `writes(root, packaged?)`. The move step touches the closed siblings and writes `.gitignore` when the line is absent; the pin step touches nothing; both write the installed skill files whose bytes differ from the packaged ones (`skillWrites`, a byte comparison per file, removed files included). `refreshSkills` shares the installed-skill listing.
4. `src/upgrade/chain.ts`: `applyUpgrade` reads the open changes, refuses a step whose `touches` names one (`open changes touched by step <from> -> <to>: <ids>`), then the union of `writes` while changes are open without `--accept-evidence-loss` (`open changes present; the upgrade would write: <paths>`), then prints the plan with `writes:` and `open, untouched:` lines, and with the flag and open changes the evidence line before applying. The runner takes `acceptEvidenceLoss` and a `refuse` callback so a test can inject a touching step and read the refusal.
5. `src/commands/upgrade.ts` keeps the first refusals (git, unreadable pin, no `.grace5/`, kernel too old, up to date) and hands the rest to the runner. `src/cli.ts`: `--accept-evidence-loss` parsed for `upgrade` only (any other command: usage error, exit 2), help texts amended. `src/commands/status.ts`: `, recorded with <kernel>` after `, counts` or `, does not count: <reason>` when the current result's receipt carries another `kernel` than the running kernel's name.
6. `src/tools/upgrade-verify.ts --with-open-change`: lays out `C-0099-open` in the clone by hand, as `init` would, because `init` refuses the stale pin of the clone; the contract is the worked example A with the id replaced; asserts the untouched line, `checked:`, the same candidate line before and after, still open and listed, closed ids and hashes unchanged, pin 0.4.0.
7. Conformance: helper `computeCandidate` excludes the pin; UP-02 narrowed to the git and usage cases; UP-05 allows the pin as the one path the pin step changes when applied alone to an upgraded repository (its `to` is 0.3.0, behind a kernel whose chain ends in a bump); UP-07 counts refreshes per `step:` line; UP-12 to UP-17 added.
8. Documents, skills, README, `bun run package`; then the iteration runs and the receipts.

## Details

- Discrimination: the new test file and helper run against the tree at `e8876f0` (exported with `git archive`, `node_modules` joined by a junction): UP-12, UP-13, UP-14, UP-15, UP-16 and UP-17 fail there, 6 of 6; the eleven earlier cases pass on both trees. The UP-07 fix is forced by this kernel: with the 0.3.0 to 0.4.0 bump the old assertion (two refreshes per link) expects six lines and the kernel prints four, one pair per step.
- The kernel's own steps never declare an open change, since the move declares the closed siblings and the pin step nothing, so the touching refusal is exercised through the runner with an injected step (UP-13), beside a black-box run where a closed sibling moves and an open change stays untouched.
- `status` appends the kernel to the current result's line whether or not it counts; the contract says "counted result" and the current result is the one close counts or rejects.
- With the flag given and open changes present the evidence line prints even when no source write is pending, as the contract words it; the plan is printed only after every refusal, so a refused invocation prints nothing but the refusal.
- An unreadable pin and a missing `.grace5/` exclude each other (the pin is read only where `.grace5/` exists), so the order `upgrade.md` and `commands.md` list for the two refusals never decides between them.
- `.grace5/README.md` does not name the candidate rule, so it is unchanged.
