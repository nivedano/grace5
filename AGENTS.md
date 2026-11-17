# Working in this repository

GRACE 5 is a kernel for owner-approved, evidence-closed changes. This repository builds it and is governed by it: a change here is a GRACE 5 change under `.grace5/`, prepared, approved by the owner on the contract, executed, verified by receipts, reviewed and closed with the kernel. Start with `bun src/cli.ts status` and `models/architecture/method.md`; the four skills in `skills/` carry the lifecycle and orchestrate approved changes.

## Standing truth

- `models/architecture/` holds the method document and its topic files, the schemas, the worked examples and the rationale ledger. One topic per file; a file is rewritten to the current state, git holds the history. Cite these documents; do not restate them.
- `models/decisions/` holds the groundings: the measured baseline that motivates the design. Numbers come from there, with their limits.
- Every mechanism of the kernel has an entry in the rationale ledger: source (an explicit owner requirement, an invariant, or an observed failure), smallest alternative, expected benefit, cost, removal criterion. No mechanism without an entry; no entry without a removal criterion.

## Rules

- Keep the surface to what the method document lists. Anything else needs a change whose Problem cites an explicit owner requirement, an invariant, or an observed failure.
- A mechanism recorded as deferred is not implemented before its admission test has been met.
- Owner approval is given by the owner alone, on the contract, and recorded as a decision bound to the contract text, its checks and the decision: `approved`, or the reason for a rejection. Never set an approval state by inference, and record no excerpt of the conversation.
- Preparation keeps one findings-only independent contract read, by a subagent that did not write the contract, before the owner gate; the author resolves every finding in the contract (`models/architecture/method.md`, `skills/grace5-prepare/SKILL.md`). No brief page is written.
- A release is a separate framework tooling act explicitly requested by the owner, as described in `models/architecture/upgrade.md` and `.agents/skills/grace5-release/SKILL.md`. Ordinary changes never bump `package.json`, `.grace5/kernel-version`, the README status line or migration table, and never register migration boundaries or rows; they may prepare migration implementation and tests before release. One version carries many changes.
- `packages/` is generated and ignored, never tracked ordinary source; `skills/` is the sole maintained skill source, and `models/architecture/cli-reference.md` is generated from the help text. Edit `skills/` or the help text and run `bun run package`, which rewrites the tracked manifest `models/architecture/package-manifest.json`.
- Mechanical work (fixtures, bulk edits, packaging generation) goes to a cheaper subagent; the lead authors, verifies, reviews and commits.
- Markdown: one paragraph or list item per physical line.
- Modifications to skill definitions and related artefacts in .agents/, `AGENTS.md` do not enter the installed CLI, and are not part of the GRACE 5 change lifecycle. They are ordinary source edits.

## Checks

`bun run check`, `bun test` (about two minutes with the runner's parallel flag, which the `test` script sets; the serial form remains valid), `bun run examples:verify`, `bun run package:verify`.
