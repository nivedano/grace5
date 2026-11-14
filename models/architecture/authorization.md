# Authorization

What an approval binds, how a revision is approved, what authorizes execution, and what a protected path is. The record is `records/approval-<rev>.xml` (`schemas/approval.xsd`).

## What the approval statement binds

The owner approves one revision of one contract. The approval record binds four things together, in one quoted statement.

| Bound thing | How |
|---|---|
| The readable contract | `contract-sha256`: SHA-256 of the bytes of `contract.xml` at that revision, with CRLF read as LF. It covers all eight sections, Checks included. |
| Each check definition | One `Bound` element per check with the SHA-256 of its canonical definition text (`evidence-records.md`). `grace5 check` prints both hashes; the agent copies them and invents none. |
| The brief the owner read | `brief-sha256`: SHA-256 of the bytes of `brief-<rev>.html` as the owner read it, so a brief edited after approval no longer matches. |
| The owner's words | `Statement` holds them verbatim; `Source` says where they were said. `decision` is `approved` or `rejected`. |

The owner approves on the brief, not on the contract. The brief carries the same contract hash, so a brief written for different contract text cannot support the approval; `close` checks that the brief, the approval and the current contract agree.

An approval exists only when the owner said so about this brief. "Proceed", "keep going" or "make a plan", said without the brief of this revision in front of the owner, is not an approval, and no agent writes the record from it. The record is agent-written, so the record alone is not proof of authority: its value is that it quotes a statement the owner can recognise or disown, and the review reads it against the conversation where it can.

## Execution authorization

An approval authorizes execution. There is one approved state, `approved`, and no second decision or later authorization. New records carry neither `executes` nor `Execution`. The schema accepts both legacy fields in records already written, and the kernel ignores them for either decision; no record is rewritten.

The owner answers the brief in one statement: approve, or reject with the reason. An approval worded to defer the start, such as "approved, hold", is still an approval: the agent waits until the owner starts the change or a batch. That is a scheduling instruction, recorded nowhere in kernel state.

`grace5 run` refuses when the current revision has no approval, except for the checks a previous approval still binds (below). Before approval the author may run project commands directly while preparing; those runs produce no receipts and are evidence of nothing.

## Material revisions

`contract.xml` holds only material content: behaviour, boundary, constraints, checks, decisions. Sequence and technical detail live in `notes.md`. So every edit to `contract.xml` is a material revision: the author increments `revision`, and the new text is unapproved until the owner approves it. A contract whose bytes differ from the approved hash under the same revision number is reported by `status` as altered after approval and is treated as unapproved.

The brief of a revision after the first is a difference brief (`brief.md`): it presents only what changed and what the change does to boundary, evidence and burden. The owner approves it like any brief.

While a revision awaits approval, or after it was rejected:

| Part of the work | State |
|---|---|
| A check whose definition hash the last approved revision bound | Still runs; work on the unamended part continues. |
| A check that is new or whose definition changed | Refused by `run` with the reason "amended in unapproved revision". |
| `close` | Refused: the current revision has no approval. |

A rejection is recorded as `approval-<rev>.xml` with `decision="rejected"` and the owner's words. The author then either restores the contract to the approved text with its approved revision number (the hash matches the earlier approval again) or writes a further revision with a higher number; a rejected number is not reused. The current revision is always the one the contract's `revision` attribute names, and the current brief and approval are the ones of that number.

What does not need re-approval: anything in `notes.md`; the choice of files inside Affected; tests and test doubles of affected files; the order of work; a rerun of any check.

## Protected paths

A `Protected` element is a path or glob the change must not write: a neighbouring component, a format definition, a generated file, a pilot repository's legacy state. Globs use `*` within a path segment and `**` across segments; a path ending in `/` covers the directory. Where a file matches both a `Path` and a `Protected`, the protection wins, so a contract may open `src/export/**` and protect one file inside it.

Protected paths block: `close` refuses when the complete diff touches one (the net difference between the tree at the start revision and the tree at the final revision; a file changed and restored is not in it), and `status` reports the violation as soon as it exists. Writing a protected path needs a material revision that removes the protection, approved by the owner.

`Path` elements are the declared write boundary. `status` lists changed files outside it so the reviewer sees them; the kernel does not block on them, because tests of affected files are inside the authorization and there is no scope engine. Whether an outside write is acceptable is a review finding.
