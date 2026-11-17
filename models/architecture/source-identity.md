# Source identity

Terminal evidence must belong to the final candidate. This file defines what a candidate is, so that changed code always invalidates evidence and a record write never does.

## The rule

Source is every path git tracks at a revision, except the kernel-managed paths: the whole state directory, `.grace5/`, and under each skill location, `.agents/skills/` and `.claude/skills/`, the directories whose names are the packaged skills' (today `grace5-prepare`, `grace5-execute`, `grace5-review`, `grace5-orchestrate`). The exclusion is by exact path prefix and nothing else: a repository's own skill beside them under the same location, and every other path, is source. Everything the kernel writes outside a change directory is kernel-managed, the version pin, the entry point `.grace5/README.md`, the local ignore file `.grace5/.gitignore` and the installed skills, so no write of `init`, `run`, `close` or `upgrade` changes any change's candidate, dirty state or complete diff, and an upgrade and a change are unconnected transactions: a change may span kernel versions, and the kernel each receipt was recorded with is read from the receipt, not from the candidate (`upgrade.md`). The exclusion covers `.grace5/changes/closed/`, where `close` moves a change, so the move and the closed changes are outside the candidate and the dirty state like the open ones. The kernel requires a git repository.

The rule has changed at two boundaries, and at each the candidate of the same tree changed once. The exclusion of the pin dates from 0.4.0; the 0.3.0 rule hashed the pin into the candidate. So at the 0.3.0 to 0.4.0 boundary a tree that carries a pin has one candidate under 0.3.0 and another under 0.4.0, and results and reviews recorded by 0.3.0 on a pinned tree do not count under 0.4.0, where they read as recorded on an earlier candidate, and are rerun and re-reviewed. A tree without a pin has the same candidate under both rules and is unaffected. The exclusion of the whole of `.grace5/` and of the installed skills dates from 0.5.0; the 0.4.0 rule hashed `.grace5/README.md` and the installed skills in. So at the 0.4.0 to 0.5.0 boundary every repository the kernel initialised, this one included, has one candidate under 0.4.0 and another under 0.5.0 for the same tree, since `.grace5/README.md` alone makes the difference, and results and reviews recorded by 0.4.0 on such a tree do not count under 0.5.0, where they read as recorded on an earlier candidate, and are redone once. A closed record is read by the rule of the kernel it names, which every record carries; the kernel compares no closed change's candidate, so those records keep their meaning for a reader who applies that rule (`upgrade.md`).

| Term | Definition |
|---|---|
| Source revision | The commit `HEAD` names when a command runs. |
| Dirty | `git status --porcelain` lists at least one source path, untracked files included, ignored files excluded. |
| Candidate | SHA-256 of the lines `<mode> <object> <path>` built from `git ls-tree -r <revision>`, one space between fields, each line ended by a line feed, sorted by the bytes of the path, with every path under `.grace5/` and under an installed `grace5-*` skill directory named by a packaged skill removed. Two revisions with the same source tree are the same candidate. |

Dirty state is what git reports: a file git is told to ignore, or to assume unchanged, is invisible to it and to the kernel, and keeping build inputs out of those is the project's responsibility. Every run receipt records `source-revision`, `dirty` and `candidate`. A receipt taken dirty is evidence for iteration only. `close` computes the candidate of a clean `HEAD` and accepts only results recorded clean on that candidate.

## Why the contract is excluded and still bound

Excluding the change directory keeps receipts, reviews, briefs, approvals, logs and notes from changing the candidate. The contract lives there too, and it is not ignored: each result carries the hash of the exact check definition it ran (`definition-sha256`), and `close` requires it to equal that check's definition hash in the current approved revision. The `contract-sha256` on a run receipt says which contract text was in force and is not itself a closing condition; on the approval it is one. A changed command or marker list therefore invalidates the results of that check and no others; a changed product file invalidates all of them. A rule that ignored the change directory without that binding would hide changed commands, and v0 does not have such a rule.

The exclusion is by path and nothing else: whatever is placed under `.grace5/` or under an installed `grace5-*` skill directory, a script, a fixture, a copy of product code, is outside the candidate and outside the dirty state, and a check's `definition-sha256` binds the command text, not a file that command executes. A check must therefore execute nothing kept in the change directory or another kernel-managed path, and a `Path` or `Protected` glob that points into one is never reported; the kernel does not detect either, and whether a command reaches into the change tree is for review to read in the contract (accepted design, review finding F6 of C-0001-kernel).

A required check whose result depends on the bytes of an installed `grace5-*` skill directory, or on any other excluded input, is installation health, not candidate evidence: the candidate is the same whatever those bytes hold, so a pass on one candidate never makes such a check current on another. It is evaluated afresh at handoff (`upgrade.md`), never carried over from an earlier result. Binding an excluded input into candidate evidence needs a bounded fingerprint of exactly those inputs under its own approved contract; hashing arbitrary caches or the whole of `.grace5/` is not such a fingerprint, and the kernel adds none.

## Examples

| Event after a clean passing run | Candidate | Effect on evidence |
|---|---|---|
| The receipt and its log are committed | Same | None. No rerun. |
| `notes.md` is edited and committed | Same | None. |
| The review record is written and committed | Same | None. |
| Another change's records are committed on the same branch | Same | None. |
| `upgrade` writes the pin, before or after it is committed | Same | None for a result recorded under this rule: it still counts, and `status` names the kernel it was recorded with. A result recorded by 0.3.0 on a pinned tree is on an earlier candidate under 0.4.0, and one recorded by 0.4.0 on a tree with `.grace5/README.md` is on an earlier candidate under 0.5.0, whether or not the pin is written. |
| `upgrade` writes the local ignore file or refreshes an installed `grace5-*` skill, or `init` writes the entry point | Same | None: these are kernel-managed paths, committed or not. A repository's own skill beside the installed ones is source, and editing it is the next row. |
| A test file is edited and committed | Different | Every result is of an earlier candidate; `close` refuses until the required checks are rerun, manual observations included. |
| A product file is edited and left uncommitted | Same revision, dirty | A new run records `dirty="true"`; `close` refuses a dirty tree. |
| A check's command is amended in a new approved revision | Same | That check's earlier results have the old definition hash and no longer count; other checks keep theirs. |
| A commit is amended without changing any source file | Same | None. The revision differs, the candidate does not. |
| Another change's product code is merged in | Different | Rerun. The inputs changed, whoever changed them. |

## Start

`grace5 run --start` records the start revision and lists every dirty source path it finds as `Preexisting`. The kernel never stages, stashes, moves or commits anything; pre-existing work is identified and left where it is, and the final candidate must be clean, so it cannot ride along unnoticed. The complete diff for review and for the protected-path rule runs from the start revision to the final revision.

A serial orchestrated batch may retain parked changes under the isolation exception in `method.md`. Each keeps its original start: later source commits from other approved changes remain in its complete diff and invalidate its earlier evidence. The ledger and change trailers identify those commits; review judges every outside path against its actual authorization and ownership, rather than filtering to the parked change's own commits or accepting all batch work automatically. Another change's approval never overrides a Protected path, and foreign work is never adopted. A resulting boundary conflict requires the normal owner-approved material revision; the kernel does not special-case batches.
