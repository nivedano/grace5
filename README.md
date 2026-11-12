# GRACE 5

A kernel for owner-approved, evidence-closed changes made by coding agents: one contract per change, one owner approval on an independent brief, isolated execution, receipts for every check, independent review, and a closure that validates verdicts.

GRACE 5 is a from-scratch successor to GRACE 4. It shares the method's lineage and nothing else: no graph documents, no source markup grammar, no literal assertions, no history engine, no migration. The measured baseline that motivates it is in `models/decisions/`.

## Layout

| Path | Holds |
|---|---|
| `models/` | Architecture and design documents: the method, schemas, worked examples, the rationale ledger, and the groundings |
| `src/` | The kernel CLI `grace5` (Bun, TypeScript), its conformance suite and its tools |
| `skills/` | The three skills: prepare, execute, review |
| `packages/` | Harness packages generated from `skills/`; never edited by hand |
| `.grace5/` | This repository's own GRACE 5 state: its changes, briefs, receipts and records |

## Status

The method is settled in `models/architecture/` and the kernel implements it: `bun src/cli.ts --help`. The skills are in `skills/`, with generated harness packages in `packages/`. Nothing here is released; pilots come next.

## Toolchain

Bun 1.4 and TypeScript, strict. `bun install`, `bun test`, `bun run check`.
