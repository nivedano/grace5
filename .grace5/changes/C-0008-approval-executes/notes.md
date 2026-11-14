# Execution notes

Resumed on 2026-11-14 from commit 0802f9e on master. The existing owner approval binds revision 1; run 1 is the baseline and records CK5 failing at version 0.5.0. No pre-existing dirty work was present. C-0007 and the closed change directories remain untouched.

Removed the execution fields from the approval reader and the second authorization state and refusal from evaluation and run. The schema accepts legacy fields optionally, with no execution semantics, including on rejections. Current approval and earlier bound-check fallback both use approval alone. New fixture approvals omit the legacy fields by default.

Updated the method, skills, brief template, L-05 and generated packages. Version and local state pin are 0.6.0. The new migration reuses the skills-only step; it declares no touched changes and performs no record conversion.

Added run-and-close cases for five legacy/new approval shapes, a rejection carrying legacy fields, fallback from a legacy false approval after an amendment, and a 0.5.0 upgrade that compares all record bytes, changed paths and candidate identity before starting the approved change. The examples verifier now validates available example records and every closed change's records, so CK3 directly covers A2.

Run 2 passed CK1, CK3, CK4, CK5 and CK6 on the dirty implementation tree for iteration. Final evidence must be taken after committing the source. Brief and review are self-authored as D3 authorizes; no subagent is used. Pilot upgrade is separate from this change, as N3 requires, after v0.6.0 is tagged.
