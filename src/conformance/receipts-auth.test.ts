// The authorization cases: approvals with and without legacy fields, rejections, a missing Source or Statement.
// Split mechanically from receipts.test.ts by C-0010; the tests are unchanged.

import { afterAll, expect, test } from "bun:test";
import { Scenario, TEST_TIMEOUT, automated, disposeAll, hasLine } from "./helper";

afterAll(() => disposeAll());

for (const legacy of [{}, { executes: true }, { executes: false }, { execution: true }, { executes: false, execution: true }]) {
  test(
    `AUTH approval runs and closes with legacy fields ${JSON.stringify(legacy)}`,
    () => {
      const s = new Scenario({ id: "C-0204-execution", checks: [automated("CK1")] });
      s.takeHashes();
      s.writeBrief();
      s.writeApproval(legacy);
      s.commit("approved");
      expect(s.check().defects).toEqual([]);
      const status = s.status();
      expect(hasLine(status, "authorization: approved")).toBe(true);
      expect(status.out).not.toContain("approved for execution");
      expect(status.out).not.toContain("approval does not authorize execution");
      const start = s.start();
      expect(start.code).toBe(0);
      expect(hasLine(start, "run 1: CK1 passed")).toBe(true);
      expect(s.run().code).toBe(0);
      s.writeReview();
      expect(s.close().code).toBe(0);
    },
    TEST_TIMEOUT,
  );
}

test(
  "AUTH rejection ignores legacy fields and never authorizes a run",
  () => {
    const s = new Scenario({ id: "C-0294-rejected", checks: [automated("CK1")] });
    s.takeHashes();
    s.writeBrief();
    s.writeApproval({ decision: "rejected", executes: true, execution: true });
    s.commit("rejected with legacy fields");
    expect(s.check().defects).toEqual([]);
    expect(hasLine(s.status(), "authorization: rejected")).toBe(true);
    expect(hasLine(s.start(), "refused: no approval for revision 1")).toBe(true);
    expect(s.runNumbers()).toEqual([]);
    expect(hasLine(s.close(), "refused: no approval for revision 1")).toBe(true);
  },
  TEST_TIMEOUT,
);

test(
  "AUTH an approval without Source reports approved, runs and closes",
  () => {
    const s = new Scenario({ id: "C-0296-no-source", checks: [automated("CK1")] });
    s.takeHashes();
    s.writeBrief();
    s.writeApproval();
    s.commit("approved without a source");
    expect(s.check().defects).toEqual([]);
    const approval = s.record("approval-1.xml");
    expect(approval).not.toContain("<Source>");
    expect(approval).toContain("<Statement>approved</Statement>");
    expect(hasLine(s.status(), "authorization: approved")).toBe(true);
    expect(s.start().code).toBe(0);
    expect(s.run().code).toBe(0);
    s.writeReview();
    expect(s.close().code).toBe(0);
  },
  TEST_TIMEOUT,
);

test(
  "AUTH a legacy Source validates and is ignored",
  () => {
    const s = new Scenario({ id: "C-0297-legacy-source", checks: [automated("CK1")] });
    s.takeHashes();
    s.writeBrief();
    s.writeApproval({ source: "Fixture conversation of the conformance suite." });
    s.commit("approved with a legacy source");
    expect(s.record("approval-1.xml")).toContain("<Source>");
    expect(s.check().defects).toEqual([]);
    expect(hasLine(s.status(), "authorization: approved")).toBe(true);
    expect(s.start().code).toBe(0);
    expect(s.run().code).toBe(0);
    s.writeReview();
    expect(s.close().code).toBe(0);
  },
  TEST_TIMEOUT,
);

test(
  "AUTH an approval with no Statement validates and runs",
  () => {
    const s = new Scenario({ id: "C-0300-no-statement", checks: [automated("CK1")] });
    s.takeHashes();
    s.writeBrief();
    s.writeApproval({ omitStatement: true });
    s.commit("approved with no statement");
    expect(s.check().defects).toEqual([]);
    expect(s.record("approval-1.xml")).not.toContain("<Statement>");
    expect(hasLine(s.status(), "authorization: approved")).toBe(true);
    expect(s.start().code).toBe(0);
    expect(s.run().code).toBe(0);
    s.writeReview();
    expect(s.close().code).toBe(0);
  },
  TEST_TIMEOUT,
);

test(
  "AUTH a rejection without a reason is a defect; with a reason it never authorizes a run",
  () => {
    const s = new Scenario({ id: "C-0298-rejected-no-reason", checks: [automated("CK1")] });
    s.takeHashes();
    s.writeBrief();
    s.writeApproval({ decision: "rejected", omitStatement: true });
    s.commit("rejected without a reason");
    expect(s.check().defects.some((d) => d.includes("a rejection carries no Statement"))).toBe(true);
    s.writeApproval({ decision: "rejected" });
    expect(s.check().defects).toEqual([]);
    expect(hasLine(s.status(), "authorization: rejected")).toBe(true);
    expect(hasLine(s.start(), "refused: no approval for revision 1")).toBe(true);
    expect(hasLine(s.close(), "refused: no approval for revision 1")).toBe(true);
  },
  TEST_TIMEOUT,
);
