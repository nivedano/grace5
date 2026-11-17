# Authorization

What an approval binds, how a revision is approved, what authorizes execution, and what a protected path is. The record is `records/approval-<rev>.xml` (`schemas/approval.xsd`).

## What the approval statement binds

The owner approves one revision of one contract. The approval record binds three things together in one decision: the text, the checks, and the decision taken. A legacy record also carries the hash of the page the owner read.

| Bound thing | How |
|---|---|
| The readable contract | `contract-sha256`: SHA-256 of the bytes of `contract.xml` at that revision, with CRLF read as LF. It covers all eight sections, Checks included. |
| Each check definition | One `Bound` element per check with the SHA-256 of its canonical definition text (`evidence-records.md`). `grace5 check` prints both hashes; the agent copies them and invents none. |
| The brief, in a legacy record | `brief-sha256` (optional): SHA-256 of the bytes of the legacy brief page the owner read. A new approval omits it and binds no page; a legacy approval keeps it, so a brief edited after approval no longer matches. |
| The decision | `decision` is `approved` or `rejected`; `date` records when the owner decided. An approval's `Statement` is the single word `approved` or is absent; a rejection's `Statement` is its reason and is required. New records omit `owner`, `recorded-by`, `Source` and any excerpt of the conversation; legacy `owner` and `recorded-by` values are accepted and ignored. |

The owner approves the contract. Its bytes are the surface the owner reads and the hash the approval binds, so a contract edited after approval no longer matches and is reported as altered after approval. A legacy approval also names the brief page the owner read, and close checks that the page, the approval and the current contract agree; a new approval names no page.

An approval exists only when the owner approves this contract. "Proceed", "keep going" or "make a plan", said without the contract of this revision in front of the owner, is not an approval, and no agent writes the record from it. The record is agent-written and the kernel authenticates no one: its authority is the owner's decision bound to the exact contract and check hashes (in a legacy record also the brief hash), and no agent infers it. The record holds no personal attribution, quote or account of the conversation. Legacy `owner`, `recorded-by` and `Source` values are accepted and ignored; new records omit them.

## Execution authorization

An approval authorizes execution. There is one approved state, `approved`, and no second decision or later authorization. New records carry neither `executes` nor `Execution`. The schema accepts both legacy fields in records already written, and the kernel ignores them for either decision; no record is rewritten.

The owner answers on the contract in one statement: approve, or reject with the reason. An approval worded to defer the start, such as "approved, hold", is still an approval: the agent waits until the owner starts the change or a batch. That is a scheduling instruction, recorded nowhere in kernel state.

`grace5 run` refuses when the current revision has no approval, except for the checks a previous approval still binds (below). Before approval the author may run project commands directly while preparing; those runs produce no receipts and are evidence of nothing.

## Material revisions

`contract.xml` holds only material content: behaviour, boundary, constraints, checks, decisions. Sequence and technical detail live in `notes.md`. So every edit to `contract.xml` is a material revision: the author increments `revision`, and the new text is unapproved until the owner approves it. A contract whose bytes differ from the approved hash under the same revision number is reported by `status` as altered after approval and is treated as unapproved.

A revision after the first is approved the same way as the first: the owner reads the whole contract, and the contract holds the material delta. No second page and no second artifact is produced.

While a revision awaits approval, or after it was rejected:

| Part of the work | State |
|---|---|
| A check whose definition hash the last approved revision bound | Still runs; work on the unamended part continues. |
| A check that is new or whose definition changed | Refused by `run` with the reason "amended in unapproved revision". |
| `close` | Refused: the current revision has no approval. |

A rejection is recorded as `approval-<rev>.xml` with `decision="rejected"` and the reason in `Statement`. The author then either restores the contract to the approved text with its approved revision number (the hash matches the earlier approval again) or writes a further revision with a higher number; a rejected number is not reused. The current revision is always the one the contract's `revision` attribute names, and the current approval is the one of that number.

What does not need re-approval: anything in `notes.md`; the choice of files inside Affected; tests and test doubles of affected files; the order of work; a rerun of any check.

## Protected paths

A `Protected` element is a path or glob the change must not write: a neighbouring component, a format definition, a generated file, a pilot repository's legacy state. Globs use `*` within a path segment and `**` across segments; a path ending in `/` covers the directory. Where a file matches both a `Path` and a `Protected`, the protection wins, so a contract may open `src/export/**` and protect one file inside it.

Protected paths block: `close` refuses when the complete source diff touches one (the net difference between the source tree at the start revision and the source tree at the final revision; a file changed and restored is not in it), and `status` reports the violation as soon as it exists. Kernel-managed paths are excluded before matching, even under a matching Protected glob (`source-identity.md`); a raw git diff that includes an installed skill refresh is not a protected-source violation. Writing a protected source path needs a material revision that removes the protection, approved by the owner.

`Path` elements are the declared write boundary. `status` lists changed files outside it so the reviewer sees them; the kernel does not block on them, because tests of affected files are inside the authorization and there is no scope engine. Whether an outside write is acceptable is a review finding.
