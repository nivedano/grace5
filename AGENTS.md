# Working in this repository

GRACE 5 is a kernel for owner-approved, evidence-closed changes. This repository builds it and is governed by it: every change here is a GRACE 5 change under `.grace5/`, prepared, briefed, approved by the owner, executed in isolation, verified by receipts, reviewed and closed. Until the kernel runs, the method documented in `models/architecture/` governs by hand.

## Standing truth

- `models/architecture/` holds the method document, the schemas, the worked examples and the rationale ledger. One topic per file; a file is rewritten to the current state, git holds the history. Cite these documents; do not restate them.
- `models/decisions/` holds the groundings: the measured baseline of GRACE 4 in use that motivates every design choice. Numbers come from there, with their limits.
- Every mechanism of the kernel has an entry in the rationale ledger: source (an explicit owner requirement, an invariant, or an observed failure), smallest alternative, expected benefit, cost, removal criterion. No mechanism without an entry; no entry without a removal criterion.

## Rules

- Nothing is copied from GRACE 4 or its tooling. Its tests may be read as examples and counterexamples only.
- A mechanism recorded as deferred is not implemented before its admission test has been met.
- Keep the surface to what the method document lists: five commands, three skills, one method document, schemas, examples, rationale ledger. Anything else needs a change whose Problem cites an explicit owner requirement, an invariant, or an observed failure.
- Owner approval is given by the owner alone, on the brief, in a quoted statement bound to the contract revision. Never set an approval state by inference.
- Mechanical work (fixtures, bulk edits, packaging generation) goes to a cheaper subagent; the lead authors, verifies, reviews and commits.
- Markdown: one paragraph or list item per physical line.
