# Notes: C-0001-kernel

## History rewritten before publication (2026-11-12)

Before the first push to the public remote the owner asked that the boot-trace example be scrubbed: it carried a real device name and real log strings from a private repository. The local history was rewritten so that those strings never appear in it; invented names replace them in `models/architecture/examples/D-trace-boot`, in `examples/defective-brief`, and in one test fixture and one hash expectation of the conformance suite. Nothing else changed.

Consequences for the records of this change, which were left byte for byte as they were written:

- Every `source-revision`, `start-revision` and `end-revision` names a commit of the history before the rewrite and does not resolve in the published one. The commits correspond one to one, in order.
- Every `candidate` hash was computed over the tree before the rewrite, so it differs from the candidate of the corresponding published commit.
- The owner's observation for CK5 (run 8) was made on the example briefs before the rewrite; brief D then read with the original names.

The records are therefore the true account of what was run, reviewed and observed, on a history that is not published. The four automated checks were run again by hand on the published head after the rewrite and passed (59 tests pass, 1 skipped); that rerun has no receipt, because the change was already closed.
