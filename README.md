# GRACE 5

A kernel for owner-approved, evidence-closed changes made by coding agents: one contract per change, one owner approval on an independent brief, isolated execution, receipts for every check, independent review, and a closure that validates verdicts.

The method is one document, `models/architecture/method.md`. The measured baseline that motivates the design is in `models/decisions/`.

## Layout

| Path | Holds |
|---|---|
| `models/` | Architecture and design documents: the method, schemas, worked examples, the rationale ledger, and the groundings |
| `src/` | The kernel CLI `grace5` (Bun, TypeScript), its conformance suite and its tools |
| `skills/` | The four skills: prepare, execute, review, orchestrate |
| `packages/` | Harness packages materialized from `skills/` by `bun run package` at build or release staging; not tracked, never edited by hand |
| `.grace5/` | This repository's own GRACE 5 state: the version pin `kernel-version`, the open changes under `.grace5/changes/`, the closed ones under `.grace5/changes/closed/`, each with its briefs, receipts and records |

## Status

Version 0.8.0, the last release: a version marks an owner-requested release and carries any number of changes (`models/architecture/upgrade.md`). An approval records a decision bound to the contract, its checks and the brief; legacy execution and source fields are ignored without rewriting records. The kernel implements the method and is closed on itself: its changes, under `.grace5/changes/`, were prepared, approved, executed, reviewed and closed with the kernel. `bun src/cli.ts --help` lists the commands. Nothing is published; pilots in real repositories run the kernel from this checkout.

## Upgrading

`grace5 status` tells you when the repository state is behind the kernel and names the command. A version is created only when the owner requests a release; changes between releases carry the last release's version, and a release ships the migration steps they need (`models/architecture/upgrade.md`). `grace5 upgrade --plan` shows the steps the kernel will apply, in plain words, and the open changes it leaves untouched. `grace5 upgrade` applies them, and you commit the result. Everything it writes is kernel-managed, the state under `.grace5/` and the installed `grace5-*` skills, which no change's candidate or diff reads, so open changes do not stop it unless a step would write one of them; `upgrade.md` names the ways out.

## Toolchain

Bun 1.4 and TypeScript, strict. `bun install`, then `bun run check`, `bun test`, `bun run examples:verify`, `bun run package:verify`.
