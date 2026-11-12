# GRACE 5

A kernel for owner-approved, evidence-closed changes made by coding agents: one contract per change, one owner approval on an independent brief, isolated execution, receipts for every check, independent review, and a closure that validates verdicts.

The method is one document, `models/architecture/method.md`. The measured baseline that motivates the design is in `models/decisions/`.

## Layout

| Path | Holds |
|---|---|
| `models/` | Architecture and design documents: the method, schemas, worked examples, the rationale ledger, and the groundings |
| `src/` | The kernel CLI `grace5` (Bun, TypeScript), its conformance suite and its tools |
| `skills/` | The three skills: prepare, execute, review |
| `packages/` | Harness packages generated from `skills/`; never edited by hand |
| `.grace5/` | This repository's own GRACE 5 state: its changes, briefs, receipts and records |

## Status

The kernel implements the method: `bun src/cli.ts --help`. Nothing here is released; pilots in real repositories come next.

## Toolchain

Bun 1.4 and TypeScript, strict. `bun install`, then `bun run check`, `bun test`, `bun run examples:verify`, `bun run package:verify`.
