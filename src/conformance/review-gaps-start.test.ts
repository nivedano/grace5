// Cases added after the independent review of C-0001-kernel (findings F1, F2, F3, F5, F8, F10 of its review-1.xml):
// the unresolvable start revision, the review coverage and the brief fidelity. Split mechanically from
// review-gaps.test.ts by C-0010; the tests are unchanged.

import { afterAll, expect, test } from "bun:test";
import {
  Scenario,
  TEST_TIMEOUT,
  attr,
  automated,
  disposeAll,
  evidenced,
  expectRefusal,
  hasLine,
  loseHistory,
  sha256,
} from "./helper";

afterAll(() => disposeAll());

test(
  "FS-15 unresolvable start revision is reported before a dirty tree",
  () => {
    const { s, startHead } = evidenced({ id: "C-0310-lost-and-dirty", protectedPaths: ["src/secret/**"], checks: [automated("CK1")] });
    loseHistory(s, startHead);
    s.writeReview();
    // And the tree is dirty as well: an untracked source file and an edited tracked one.
    s.write("stray.txt", "left lying around\n");
    s.write("src/other.txt", "another tracked file\nedited and not committed\n");
    expect(hasLine(s.status(), /^candidate: [0-9a-f]{64} \(dirty\)$/)).toBe(true);

    const close = s.close();
    expectRefusal(s, close, "start revision cannot be resolved");
    expect(close.out).not.toContain("working tree is dirty");
  },
  TEST_TIMEOUT,
);

test(
  "FS-18 a check the review says does not discriminate refuses close",
  () => {
    const { s } = evidenced({ id: "C-0311-adequacy", checks: [automated("CK1"), automated("CK2")] });
    s.writeReview({ notDiscriminating: ["CK2"] });
    expect(hasLine(s.status(), "next: check CK2 does not discriminate")).toBe(true);
    expectRefusal(s, s.close(), "check CK2 does not discriminate");

    s.writeReview();
    expect(s.close().code).toBe(0);
  },
  TEST_TIMEOUT,
);

test(
  "RV-10 run refuses a change whose approved legacy brief has a fidelity defect",
  () => {
    const s = new Scenario({ id: "C-0312-run-defect", protectedPaths: ["src/secret/**"], checks: [automated("CK1")] });
    s.takeHashes();
    s.writeBrief({ omitProtected: ["src/secret/**"] });
    s.writeApproval();
    s.commit("prepare with a defective brief");
    expect(hasLine(s.status(), "authorization: approved")).toBe(true);

    const start = s.start();
    expect(start.code).toBe(1);
    expect(hasLine(start, /^refused: change has defects: .*brief-1\.html: protected path src\/secret\/\*\* is missing/)).toBe(true);
    // A refused invocation writes no receipt.
    expect(s.runNumbers()).toEqual([]);

    // Control: with the complete brief, and an approval of that page, the same change starts.
    s.writeBrief();
    s.writeApproval();
    const ok = s.start();
    expect(ok.code).toBe(0);
    expect(hasLine(ok, "run 1: CK1 passed")).toBe(true);
  },
  TEST_TIMEOUT,
);

test(
  "FS-15 unresolvable start revision refuses close (RV-01)",
  () => {
    const { s, startHead } = evidenced({ id: "C-0301-lost-start", protectedPaths: ["src/secret/**"], checks: [automated("CK1")] });
    const candidate = s.computeCandidate();

    loseHistory(s, startHead);
    // The source tree, and so the candidate and the evidence on it, are what they were.
    expect(s.computeCandidate()).toBe(candidate);
    expect(attr(s.receipt(1), "Run", "source-revision")).toBe(startHead);
    s.writeReview();

    // A diff that cannot be computed is not a diff that touches nothing.
    expect(hasLine(s.status(), /^next: close\b/)).toBe(false);
    expectRefusal(s, s.close(), "start revision cannot be resolved");
  },
  TEST_TIMEOUT,
);

test(
  "FS-16 review must cover the complete diff (RV-02)",
  () => {
    const { s, startHead } = evidenced({ id: "C-0302-coverage", checks: [automated("CK1")] });
    expect(s.head()).not.toBe(startHead);

    // A re-review of the last step alone: its diff starts at the final revision, not at the start revision.
    s.writeReview({ startRevision: s.head() });
    expectRefusal(s, s.close(), "review does not cover the complete diff");

    // A review of other contract text.
    s.writeReview({ contractSha: sha256("some earlier contract text") });
    expectRefusal(s, s.close(), "review covers an earlier revision");

    // A review that names the final candidate and ends at a revision carrying another one.
    s.writeReview({ endRevision: startHead });
    expectRefusal(s, s.close(), "review covers an earlier candidate");

    // Control: start revision to final revision, current contract, final candidate.
    s.writeReview();
    const close = s.close();
    expect(close.code).toBe(0);
    expect(attr(s.record("close.xml"), "Close", "review")).toBe("4");
  },
  TEST_TIMEOUT,
);

test(
  "FS-17 owner-disposed needs the owner's recorded decision (RV-03)",
  () => {
    const { s } = evidenced({ id: "C-0303-disposed", checks: [automated("CK1")] });
    s.writeReview({ findings: [{ id: "F1", severity: "blocking", status: "owner-disposed", ownerDecision: false }] });
    expectRefusal(s, s.close(), "blocking finding F1 is disposed without an owner decision");

    s.writeReview({ findings: [{ id: "F1", severity: "blocking", status: "owner-disposed" }] });
    expect(s.close().code).toBe(0);
    expect(s.hasRecord("close.xml")).toBe(true);

    // A closed change refuses further runs, in the documented words.
    const after = s.run();
    expect(after.code).toBe(1);
    expect(hasLine(after, "refused: change is closed")).toBe(true);
    expect(s.runNumbers()).toEqual([1, 2]);
  },
  TEST_TIMEOUT,
);

test(
  "FS-14 a current legacy brief with a stale or missing contract hash is a defect",
  () => {
    const s = new Scenario({ id: "C-0313-stale-brief", protectedPaths: ["src/secret/**"], checks: [automated("CK1")] });
    s.takeHashes();
    const briefDefect = /^refused: change has defects: .*brief-1\.html/;

    // The brief of the current revision carries the hash of other contract text, and omits a protected path. A brief is
    // validated only for a legacy approval that names it (C-0019); the owner approved exactly that page.
    s.writeBrief({ omitProtected: ["src/secret/**"], contractShaMeta: sha256("other contract text") });
    s.writeApproval();
    const stale = s.check();
    expect(stale.code).toBe(1);
    expect(stale.defects.some((d) => d.startsWith("brief-1.html: "))).toBe(true);
    s.commit("prepare with a brief written for other contract text");
    const staleStart = s.start();
    expect(staleStart.code).toBe(1);
    expect(hasLine(staleStart, briefDefect)).toBe(true);
    expect(s.runNumbers()).toEqual([]);

    // The same brief with no contract hash at all.
    s.writeBrief({ omitProtected: ["src/secret/**"], contractShaMeta: null });
    const missing = s.check();
    expect(missing.code).toBe(1);
    expect(missing.defects.some((d) => d.startsWith("brief-1.html: "))).toBe(true);
    s.writeApproval();
    const missingStart = s.start();
    expect(missingStart.code).toBe(1);
    expect(hasLine(missingStart, briefDefect)).toBe(true);
    expect(s.runNumbers()).toEqual([]);

    // A complete brief with only the hash wrong is a defect by that alone.
    s.writeBrief({ contractShaMeta: sha256("other contract text") });
    const hashOnly = s.check();
    expect(hashOnly.code).toBe(1);
    expect(hashOnly.defects.some((d) => d.startsWith("brief-1.html: "))).toBe(true);

    // Control: the sound brief, approved, starts.
    s.writeBrief();
    s.writeApproval();
    expect(s.check().defects).toEqual([]);
    expect(s.start().code).toBe(0);
  },
  TEST_TIMEOUT,
);
