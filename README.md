# GRACE 5

A kernel for owner-approved, evidence-closed changes made by coding agents: one contract per change, one owner approval on an independent brief, isolated execution, receipts for every check, independent review, and a closure that validates verdicts.

GRACE 5 is a from-scratch successor to GRACE 4. It shares the method's lineage and nothing else: no graph documents, no source markup grammar, no literal assertions, no history engine, no migration. The measured baseline that motivates it is in `models/decisions/`.

## Layout

| Path | Holds |
|---|---|
| `models/` | Architecture and design documents: the method, schemas, worked examples, the rationale ledger, and the groundings |
| `src/` | The kernel CLI (Bun, TypeScript) |
| `.grace5/` | This repository's own GRACE 5 state: its changes, briefs, receipts and records |

## Status

Early design. Nothing here is released.

## Toolchain

Bun 1.4 and TypeScript, strict. `bun install`, `bun test`, `bun run check`.
