# .grace5

GRACE 5 state of this repository: one directory per open change under `changes/`, each holding `contract.xml`, `notes.md` and `records/` (brief, approval, run receipts, review, close); `grace5 close` moves a closed change to `changes/closed/<id>/`, where it keeps every record.

The directory is named `.grace5` so that a repository can carry GRACE 4 `.grace/` state beside it without either tool reading the other's files.

Changes here are made with the kernel: `bun src/cli.ts status`.
