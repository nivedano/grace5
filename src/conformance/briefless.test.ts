// Conformance cases BN-01 .. BN-05 of models/architecture/conformance.md: the contract is the owner's approval
// surface. A new change has no brief and its approval carries no `brief-sha256`; a legacy approval keeps its brief
// binding, and a contract altered after approval is still detected with no brief to hide it.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { Scenario, TEST_TIMEOUT, attr, automated, disposeAll, hasLine, prepared, preparedBriefless, type ContractDef } from "./helper";

afterAll(() => disposeAll());

test(
  "BN-01 a new change with no brief approves, starts, runs, reviews and closes",
  () => {
    const s = preparedBriefless({ id: "C-0401-briefless", protectedPaths: ["src/secret/**"], checks: [automated("CK1")] });
    // No page exists and the approval binds none.
    expect(s.hasRecord("brief-1.html")).toBe(false);
    expect(attr(s.record("approval-1.xml"), "Approval", "brief-sha256")).toBeUndefined();

    const checked = s.check();
    expect(checked.defects).toEqual([]);
    expect(checked.code).toBe(0);
    expect(hasLine(s.status(), "authorization: approved")).toBe(true);

    expect(s.start().code).toBe(0);
    s.changeProduct("the wanted line");
    expect(s.run().code).toBe(0);
    s.writeReview();
    expect(hasLine(s.status(), "next: close")).toBe(true);

    const close = s.close();
    expect(close.code).toBe(0);
    expect(s.hasRecord("close.xml")).toBe(true);
    // The close names the approval and no brief.
    expect(attr(s.record("close.xml"), "Close", "brief")).toBeUndefined();
    expect(attr(s.record("close.xml"), "Close", "approval")).toBe("approval-1.xml");
    // The closed, moved change still reads with no defect.
    expect(s.check().defects).toEqual([]);
  },
  TEST_TIMEOUT,
);

test(
  "BN-02 a legacy approval still validates its brief, runs and closes naming it",
  () => {
    const s = prepared({ id: "C-0402-legacy-brief", protectedPaths: ["src/secret/**"], checks: [automated("CK1")] });
    // The legacy approval names the brief the owner read.
    expect(s.hasRecord("brief-1.html")).toBe(true);
    expect(attr(s.record("approval-1.xml"), "Approval", "brief-sha256")).toMatch(/^[0-9a-f]{64}$/);
    expect(s.check().defects).toEqual([]);

    expect(s.start().code).toBe(0);
    s.changeProduct("the wanted line");
    expect(s.run().code).toBe(0);
    s.writeReview();
    expect(s.close().code).toBe(0);
    expect(attr(s.record("close.xml"), "Close", "brief")).toBe("brief-1.html");
  },
  TEST_TIMEOUT,
);

test(
  "BN-03 a legacy brief edited after approval, or missing, still refuses close",
  () => {
    const s = prepared({ id: "C-0403-legacy-mismatch", protectedPaths: ["src/secret/**"], checks: [automated("CK1")] });
    expect(s.start().code).toBe(0);
    s.changeProduct("the wanted line");
    expect(s.run().code).toBe(0);
    s.writeReview();

    const briefRel = `.grace5/changes/${s.id}/records/brief-1.html`;
    const original = s.read(briefRel);
    s.write(briefRel, original.replace("The fixture checks say little about a real product.", "There are no risks at all."));
    const edited = s.close();
    expect(edited.code).toBe(1);
    expect(hasLine(edited, "refused: brief does not match the approval")).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);

    fs.rmSync(path.join(s.repo, briefRel));
    const missing = s.close();
    expect(missing.code).toBe(1);
    expect(hasLine(missing, "refused: no brief for revision 1")).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);

    // Control: the page the owner read back in place closes the change.
    s.write(briefRel, original);
    expect(s.close().code).toBe(0);
  },
  TEST_TIMEOUT,
);

test(
  "BN-04 an approval without brief-sha256 binds the contract and checks; a missing Bound still fails",
  () => {
    const s = new Scenario({ id: "C-0404-briefless-unbound", checks: [automated("CK1")] });
    s.takeHashes();
    s.writeApproval({ briefless: true, omitBound: ["CK1"] });
    s.commit("prepare with an unbound briefless approval");

    // The decision is read as approved; the missing Bound is the defect, and it holds run and close.
    expect(hasLine(s.status(), "authorization: approved")).toBe(true);
    const checked = s.check();
    expect(checked.defects.some((d) => d.includes("Bound"))).toBe(true);
    const start = s.start();
    expect(start.code).toBe(1);
    expect(hasLine(start, /^refused: change has defects: .*Bound/)).toBe(true);
    expect(s.runNumbers()).toEqual([]);

    // Control: the complete briefless approval binds the check and authorizes the run.
    s.writeApproval({ briefless: true });
    const ok = s.start();
    expect(ok.code).toBe(0);
    expect(hasLine(ok, "run 1: CK1 passed")).toBe(true);
  },
  TEST_TIMEOUT,
);

test(
  "BN-05 a contract altered after approval with no brief is still detected",
  () => {
    const def: ContractDef = { id: "C-0405-briefless-altered", checks: [automated("CK1")] };
    const s = preparedBriefless(def);
    expect(s.start().code).toBe(0);
    s.changeProduct("the wanted line");
    expect(s.run().code).toBe(0);
    s.writeReview();

    // The contract text changes without a new revision: no brief exists that could hide the alteration.
    s.writeContract({ ...def, change: "The product file carries a different line." });
    expect(hasLine(s.status(), "authorization: altered after approval")).toBe(true);
    const close = s.close();
    expect(close.code).toBe(1);
    expect(hasLine(close, "refused: contract altered after approval")).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);

    // Control: restoring the approved bytes restores the approval and the change closes.
    s.writeContract(def);
    expect(s.close().code).toBe(0);
  },
  TEST_TIMEOUT,
);
