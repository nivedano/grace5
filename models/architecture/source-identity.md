# Source identity

Terminal evidence must belong to the final candidate. This file defines what a candidate is, so that changed code always invalidates evidence and a record write never does.

## The rule

Source is every path git tracks at a revision, except the GRACE 5 change directories: `.grace5/changes/**`. The kernel requires a git repository.

| Term | Definition |
|---|---|
| Source revision | The commit `HEAD` names when a command runs. |
| Dirty | `git status --porcelain` lists at least one source path, untracked files included, ignored files excluded. |
| Candidate | SHA-256 of the lines `<mode> <object> <path>` built from `git ls-tree -r <revision>`, one space between fields, each line ended by a line feed, sorted by the bytes of the path, with every path under `.grace5/changes/` removed. Two revisions with the same source tree are the same candidate. |

Every run receipt records `source-revision`, `dirty` and `candidate`. A receipt taken dirty is evidence for iteration only. `close` computes the candidate of a clean `HEAD` and accepts only results recorded clean on that candidate.

## Why the contract is excluded and still bound

Excluding the change directory keeps receipts, reviews, briefs, approvals, logs and notes from changing the candidate. The contract lives there too, and it is not ignored: each result carries the hash of the exact check definition it ran (`definition-sha256`), and `close` requires it to equal that check's definition hash in the current approved revision. The `contract-sha256` on a run receipt says which contract text was in force and is not itself a closing condition; on the brief and the approval it is one. A changed command or marker list therefore invalidates the results of that check and no others; a changed product file invalidates all of them. A rule that ignored the change directory without that binding would hide changed commands, and v0 does not have such a rule.

## Examples

| Event after a clean passing run | Candidate | Effect on evidence |
|---|---|---|
| The receipt and its log are committed | Same | None. No rerun. |
| `notes.md` is edited and committed | Same | None. |
| The review record is written and committed | Same | None. |
| Another change's records are committed on the same branch | Same | None. |
| A test file is edited and committed | Different | Every result is of an earlier candidate; `close` refuses until the required checks are rerun, manual observations included. |
| A product file is edited and left uncommitted | Same revision, dirty | A new run records `dirty="true"`; `close` refuses a dirty tree. |
| A check's command is amended in a new approved revision | Same | That check's earlier results have the old definition hash and no longer count; other checks keep theirs. |
| A commit is amended without changing any source file | Same | None. The revision differs, the candidate does not. |
| Another change's product code is merged in | Different | Rerun. The inputs changed, whoever changed them. |

## Start

`grace5 run --start` records the start revision and lists every dirty source path it finds as `Preexisting`. The kernel never stages, stashes, moves or commits anything; pre-existing work is identified and left where it is, and the final candidate must be clean, so it cannot ride along unnoticed. The complete diff for review and for the protected-path rule runs from the start revision to the final revision.
