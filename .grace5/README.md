# .grace5

GRACE 5 state of this repository: one directory per open change under `changes/`, each holding `contract.xml`, `notes.md` and `records/` (brief, approval, run receipts, review, close); `grace5 close` moves a closed change to `changes/closed/<id>/`, where it keeps every record.

`kernel-version` pins the version this state conforms to; a kernel of another version refuses to operate on it, and `grace5 upgrade` brings the state to the kernel's version (`models/architecture/upgrade.md`). `.gitignore` here keeps the run logs under `records/logs/` out of git; the receipts carry their hashes.

The directory is named `.grace5` so that a repository can carry GRACE 4 `.grace/` state beside it without either tool reading the other's files.

Changes here are made with the kernel: `bun src/cli.ts status`.
