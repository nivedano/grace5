// Cases added after the independent review of C-0001-kernel (findings F1, F2, F3, F5, F8, F10 of its review-1.xml):
// the refusals of close, the changed definition, the standard error and the older briefs. Split mechanically from
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
  prepared,
  streamLines,
  type CliResult,
  type ContractDef,
} from "./helper";

afterAll(() => disposeAll());

test(
  "RV-04 a defective legacy brief holds close",
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
  "FL-04 a material amendment not yet approved: no brief obligation, bound checks run, amended checks are refused",
  () => {
    const rev1: ContractDef = { id: "C-0314-draft-brief", protectedPaths: ["src/secret/**"], checks: [automated("CK1")] };
    const s = prepared(rev1);
    expect(s.start().code).toBe(0);

    // Revision 2 adds a check. It is unapproved, so it has no legacy approval and no brief obligation; a page written
    // for it is never validated (C-0019), and it still holds nothing.
    s.writeContract({ id: rev1.id, revision: 2, protectedPaths: ["src/secret/**"], checks: [automated("CK1"), automated("CK2", "bun tools/env.js")] });
    s.takeHashes();
    s.writeBrief({ omitProtected: ["src/secret/**"] });
    const check = s.check();
    expect(check.code).toBe(0);
    expect(check.out).not.toContain("brief-2.html");
    expect(s.hasRecord("approval-2.xml")).toBe(false);
    expect(hasLine(s.status(), "next: no approval for revision 2")).toBe(true);

    const bound = s.run("--check", "CK1");
    expect(bound.out).not.toContain("change has defects");
    expect(bound.code).toBe(0);
    expect(hasLine(bound, "run 2: CK1 passed")).toBe(true);

    const added = s.run("--check", "CK2");
    expect(added.code).toBe(1);
    expect(hasLine(added, "run 3: CK2 refused: amended in unapproved revision")).toBe(true);
    expect(added.out).not.toContain("change has defects");

    const close = s.close();
    expect(close.code).toBe(1);
    expect(hasLine(close, "refused: no approval for revision 2")).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);
  },
  TEST_TIMEOUT,
);

test(
  "FS-14 a legacy brief of an older revision is history and is no defect",
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
