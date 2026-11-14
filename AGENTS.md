# Working in this repository

GRACE 5 is a kernel for owner-approved, evidence-closed changes. This repository builds it and is governed by it: a change here is a GRACE 5 change under `.grace5/`, prepared, briefed, approved by the owner, executed, verified by receipts, reviewed and closed with the kernel. Start with `bun src/cli.ts status` and `models/architecture/method.md`; the four skills in `skills/` carry the lifecycle and orchestrate approved changes.

## Standing truth

- `models/architecture/` holds the method document and its topic files, the schemas, the brief template, the worked examples and the rationale ledger. One topic per file; a file is rewritten to the current state, git holds the history. Cite these documents; do not restate them.
- `models/decisions/` holds the groundings: the measured baseline that motivates the design. Numbers come from there, with their limits.
- Every mechanism of the kernel has an entry in the rationale ledger: source (an explicit owner requirement, an invariant, or an observed failure), smallest alternative, expected benefit, cost, removal criterion. No mechanism without an entry; no entry without a removal criterion.

## Rules

- Keep the surface to what the method document lists. Anything else needs a change whose Problem cites an explicit owner requirement, an invariant, or an observed failure.
- A mechanism recorded as deferred is not implemented before its admission test has been met.
- Owner approval is given by the owner alone, on the brief, and recorded as a decision bound to the contract revision: `approved`, or the reason for a rejection. Never set an approval state by inference, and record no excerpt of the conversation.
- A version is a release, not a change. Do not bump `package.json`, `.grace5/kernel-version`, the README status line or the migration table in an ordinary change; a release is a separate change the owner requests explicitly, and one version carries many changes (`models/architecture/upgrade.md`).
- `packages/` and `models/architecture/cli-reference.md` are generated: edit `skills/` or the help text and run `bun run package`.
- Mechanical work (fixtures, bulk edits, packaging generation) goes to a cheaper subagent; the lead authors, verifies, reviews and commits.
- Markdown: one paragraph or list item per physical line.

## Checks

`bun run check`, `bun test` (about four minutes), `bun run examples:verify`, `bun run package:verify`.
