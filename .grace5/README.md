# .grace5

GRACE 5 state of this repository: one directory per change under `changes/`, each holding `contract.xml`, `notes.md` and `records/` (brief, approval, run receipts, review, close).

The directory is named `.grace5` so that a repository can carry GRACE 4 `.grace/` state beside it without either tool reading the other's files.

Changes here are made with the kernel: `bun src/cli.ts status`.
