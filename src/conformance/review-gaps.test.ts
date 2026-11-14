// Cases added after the independent review of C-0001-kernel (findings F1, F2, F3, F5, F8, F10 of its review-1.xml):
// obligations of close that the first suite did not reach.

import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  TEST_TIMEOUT,
  Scenario,
  attr,
  automated,
  disposeAll,
  hasLine,
  prepared,
  sha256,
  type CliResult,
  type ContractDef,
} from "./helper";

afterAll(() => disposeAll());

function streamLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l !== "");
}

function expectRefusal(s: Scenario, close: CliResult, phrase: string | RegExp): void {
  expect(close.code).toBe(1);
  expect(hasLine(close, typeof phrase === "string" ? `refused: ${phrase}` : phrase)).toBe(true);
  expect(s.hasRecord("close.xml")).toBe(false);
}

/** Started, product changed and committed, final evidence taken: only the review is missing. */
function evidenced(def: ContractDef): { s: Scenario; startHead: string } {
  const s = prepared(def);
  const startHead = s.head();
  expect(s.start().code).toBe(0);
  s.changeProduct("the wanted line");
  expect(s.run().code).toBe(0);
  return { s, startHead };
}

/** Rewrites history: one orphan commit holds the same tree, the old branch and its objects are gone. */
function loseHistory(s: Scenario, startHead: string): void {
  const branch = s.git("rev-parse", "--abbrev-ref", "HEAD").trim();
  s.git("checkout", "-q", "--orphan", "rewritten");
  s.git("add", "-A");
  s.git("commit", "-q", "-m", "history rewritten");
  s.git("branch", "-D", branch);
  s.git("reflog", "expire", "--expire=now", "--all");
  s.git("gc", "-q", "--prune=now");
  const probe = spawnSync("git", ["cat-file", "-e", `${startHead}^{commit}`], { cwd: s.repo, encoding: "utf8" });
  expect(probe.status).not.toBe(0);
}

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
  "RV-10 run refuses a change whose approved brief has a fidelity defect",
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
  "FS-17 owner-disposed needs the owner's words (RV-03)",
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
  "RV-04 a defective brief holds close",
  () => {
    const s = new Scenario({ id: "C-0304-brief-defect", protectedPaths: ["src/secret/**"], checks: [automated("CK1")] });
    s.takeHashes();
    // The brief the owner read leaves out the protected path; the approval binds exactly that page.
    s.writeBrief({ omitProtected: ["src/secret/**"] });
    s.writeApproval();
    s.commit("prepare with a defective brief");
    expect(hasLine(s.check(), "defect: brief-1.html: protected path src/secret/** is missing")).toBe(true);

    // Everything else is carried as far as the kernel lets it go.
    s.start();
    s.changeProduct("the wanted line");
    s.run();
    s.writeReview();

    expect(hasLine(s.status(), /^next: close\b/)).toBe(false);
    expectRefusal(s, s.close(), /^refused: change has defects: .*brief-1\.html: protected path src\/secret\/\*\* is missing/);
  },
  TEST_TIMEOUT,
);

test(
  "FS-18 violated rule refuses close (RV-05)",
  () => {
    const def: ContractDef = { id: "C-0305-rule", rule: "docs/rules.md#R-1", checks: [automated("CK1")] };
    const s = new Scenario(def);
    s.write("docs/rules.md", "# Rules\n\nR-1: the fixture scripts stay as they are.\n");
    s.prepare();
    expect(s.start().code).toBe(0);
    expect(s.run().code).toBe(0);

    s.writeReview({ rules: [{ rule: "docs/rules.md#R-1", verdict: "violated" }] });
    expect(hasLine(s.status(), "next: rule violated: docs/rules.md#R-1")).toBe(true);
    expectRefusal(s, s.close(), "rule violated: docs/rules.md#R-1");

    s.writeReview({ rules: [{ rule: "docs/rules.md#R-1", verdict: "upheld" }] });
    expect(s.close().code).toBe(0);
  },
  TEST_TIMEOUT,
);

test(
  "RV-06 changed definition voids only that check",
  () => {
    const rev1: ContractDef = { id: "C-0306-definition", checks: [automated("CK1"), automated("CK2")] };
    const { s } = evidenced(rev1);
    expect(hasLine(s.status(), "check CK2: passed, counts")).toBe(true);

    // Revision 2 changes CK2's command and is approved. The source does not change.
    s.writeContract({ id: rev1.id, revision: 2, checks: [automated("CK1"), automated("CK2", "bun tools/env.js")] });
    s.takeHashes();
    s.writeBrief();
    s.writeApproval();
    s.writeReview();

    const status = s.status();
    expect(hasLine(status, "authorization: approved")).toBe(true);
    expect(hasLine(status, "check CK1: passed, counts")).toBe(true);
    expect(hasLine(status, "check CK2: passed, does not count: definition changed since the result")).toBe(true);
    expectRefusal(s, s.close(), "check CK2: definition changed since the result");

    // Only CK2 is rerun; CK1 keeps the result of run 2.
    const rerun = s.run("--check", "CK2");
    expect(rerun.code).toBe(0);
    expect(hasLine(rerun, "run 3: CK2 passed")).toBe(true);
    expect(s.close().code).toBe(0);
    const closeXml = s.record("close.xml");
    expect(closeXml).toMatch(/<Satisfied\b(?=[^>]*\scheck="CK1")(?=[^>]*\srun="2")[^>]*>/);
    expect(closeXml).toMatch(/<Satisfied\b(?=[^>]*\scheck="CK2")(?=[^>]*\srun="3")[^>]*>/);
  },
  TEST_TIMEOUT,
);

test(
  "RV-07 refusals are on standard error",
  () => {
    const s = prepared({ id: "C-0307-stderr", checks: [automated("CK1")] });
    const onStderrOnly = (r: CliResult, line: string) => {
      expect(r.code).toBe(1);
      expect(streamLines(r.stderr)).toContain(line);
      expect(streamLines(r.stdout).some((l) => l.startsWith("refused:"))).toBe(false);
    };
    onStderrOnly(s.run(), "refused: no start run");
    onStderrOnly(s.close(), "refused: no start run");
    expect(s.start().code).toBe(0);
    onStderrOnly(s.start(), "refused: a start run exists: run-1");
    onStderrOnly(s.close(), "refused: no review");
    // What is not a refusal stays on standard output.
    const run = s.run();
    expect(streamLines(run.stdout)).toContain("run 2: CK1 passed");
    expect(run.stderr.trim()).toBe("");
  },
  TEST_TIMEOUT,
);

test(
  "RV-08 a result recorded dirty does not count once the tree is clean again",
  () => {
    const s = prepared({ id: "C-0308-dirty", checks: [automated("CK1")] });
    expect(s.start().code).toBe(0);
    const product = s.read("src/product.txt");
    s.write("src/product.txt", product + "an uncommitted line\n");
    expect(s.run().code).toBe(0);
    expect(attr(s.receipt(2), "Run", "dirty")).toBe("true");
    // The edit is taken back: the tree is clean and the candidate is the one the receipt names.
    s.write("src/product.txt", product);
    s.writeReview();

    const status = s.status();
    expect(hasLine(status, /^candidate: [0-9a-f]{64} \(clean\)$/)).toBe(true);
    expect(hasLine(status, "check CK1: passed, does not count: recorded dirty")).toBe(true);
    expectRefusal(s, s.close(), "check CK1: recorded dirty");

    expect(s.run().code).toBe(0);
    expect(s.close().code).toBe(0);
  },
  TEST_TIMEOUT,
);

test(
  "RV-09 an approval that does not bind every check does not close",
  () => {
    const s = new Scenario({ id: "C-0309-unbound", checks: [automated("CK1"), automated("CK2")] });
    s.takeHashes();
    s.writeBrief();
    s.writeApproval({ omitBound: ["CK2"] });
    s.commit("an approval with one Bound missing");
    expect(s.check().code).toBe(1);

    const close = s.close();
    expect(close.code).toBe(1);
    // Step 1 of close names it; a kernel that holds close on check's defects may name it through the defect.
    expect(hasLine(close, /^refused: (approval does not bind check CK2$|change has defects: .*CK2)/)).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);
  },
  TEST_TIMEOUT,
);

test(
  "FS-14 a current brief with a stale or missing contract hash is a defect",
  () => {
    const s = new Scenario({ id: "C-0313-stale-brief", protectedPaths: ["src/secret/**"], checks: [automated("CK1")] });
    s.takeHashes();
    const briefDefect = /^refused: change has defects: .*brief-1\.html/;

    // The brief of the current revision carries the hash of other contract text, and omits a protected path.
    s.writeBrief({ omitProtected: ["src/secret/**"], contractShaMeta: sha256("other contract text") });
    const stale = s.check();
    expect(stale.code).toBe(1);
    expect(stale.defects.some((d) => d.startsWith("brief-1.html: "))).toBe(true);
    // The owner approved exactly that page.
    s.writeApproval();
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

test(
  "FL-04 a defective draft brief does not stop bound checks",
  () => {
    const rev1: ContractDef = { id: "C-0314-draft-brief", protectedPaths: ["src/secret/**"], checks: [automated("CK1")] };
    const s = prepared(rev1);
    expect(s.start().code).toBe(0);

    // Revision 2 adds a check. Its brief is drafted, defective, and not approved.
    s.writeContract({ id: rev1.id, revision: 2, protectedPaths: ["src/secret/**"], checks: [automated("CK1"), automated("CK2", "bun tools/env.js")] });
    s.takeHashes();
    s.writeBrief({ omitProtected: ["src/secret/**"] });
    const check = s.check();
    expect(check.code).toBe(1);
    expect(hasLine(check, "defect: brief-2.html: protected path src/secret/** is missing")).toBe(true);
    expect(s.hasRecord("approval-2.xml")).toBe(false);

    const bound = s.run("--check", "CK1");
    expect(bound.out).not.toContain("change has defects");
    expect(bound.code).toBe(0);
    expect(hasLine(bound, "run 2: CK1 passed")).toBe(true);

    const added = s.run("--check", "CK2");
    expect(added.code).toBe(1);
    expect(hasLine(added, "run 3: CK2 refused: amended in unapproved revision")).toBe(true);
    expect(added.out).not.toContain("change has defects");
  },
  TEST_TIMEOUT,
);

test(
  "FS-14 a brief of an older revision is history and is no defect",
  () => {
    const rev1: ContractDef = { id: "C-0315-old-brief", protectedPaths: ["src/secret/**"], checks: [automated("CK1")] };
    const s = prepared(rev1);

    // Revision 2 protects one more path and adds a check: read against it, brief-1.html would lack both and carry another hash.
    s.writeContract({
      id: rev1.id,
      revision: 2,
      protectedPaths: ["src/secret/**", "docs/frozen.md"],
      checks: [automated("CK1"), automated("CK2", "bun tools/env.js")],
    });
    s.takeHashes();
    s.writeBrief();
    s.writeApproval();
    s.commit("revision 2 approved on its own brief");
    expect(s.hasRecord("brief-1.html")).toBe(true);
    expect(s.hasRecord("approval-1.xml")).toBe(true);

    const check = s.check();
    expect(check.defects).toEqual([]);
    expect(check.code).toBe(0);
    const start = s.start();
    expect(start.code).toBe(0);
    expect(hasLine(start, "run 1: CK2 passed")).toBe(true);
    expect(start.out).not.toContain("change has defects");
  },
  TEST_TIMEOUT,
);
