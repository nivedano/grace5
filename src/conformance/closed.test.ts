// Conformance cases CL-01 .. CL-06 of models/architecture/conformance.md: closed changes move under closed/ and stay
// closed there, and a cited rule under a change's own Affected is never a defect, so a historical record survives a
// retirement.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { HEX64, Scenario, TEST_TIMEOUT, automated, contractXml, disposeAll, hasLine, prepared, type CliResult, type ContractDef } from "./helper";

afterAll(() => disposeAll());

/** Starts, changes the product, takes final evidence, writes the review and closes. Nothing is committed after the run, so the logs stay untracked. */
function closeFully(s: Scenario): CliResult {
  expect(s.start().code).toBe(0);
  s.changeProduct("the wanted line");
  expect(s.run().code).toBe(0);
  s.writeReview();
  const close = s.close();
  expect(close.code).toBe(0);
  return close;
}

/** A second change in the same repository, prepared and closed; the scenario then speaks for that change. */
function closeSecond(s: Scenario, def: ContractDef): CliResult {
  s.writeContract(def);
  s.prepare();
  return closeFully(s);
}

const closedPath = (id: string): string => `.grace5/changes/closed/${id}`;

test(
  "CL-01 close writes close.xml, then moves the whole change directory under closed/, and the moved change validates unchanged",
  () => {
    const s = prepared({ id: "C-0401-moved", checks: [automated("CK1")] });
    const before = s.check();
    const close = closeFully(s);
    expect(hasLine(close, `closed: ${closedPath(s.id)}/records/close.xml`)).toBe(true);
    expect(close.out).not.toContain("not moved");

    // The open location is gone; the closed one holds the contract, every record and the untracked logs.
    expect(fs.existsSync(s.openChangeDir)).toBe(false);
    expect(fs.existsSync(path.join(s.closedChangeDir, "contract.xml"))).toBe(true);
    expect(fs.existsSync(path.join(s.closedChangeDir, "records", "close.xml"))).toBe(true);
    expect(fs.existsSync(path.join(s.closedChangeDir, "records", "run-2.xml"))).toBe(true);
    expect(fs.existsSync(path.join(s.closedChangeDir, "records", "logs", "run-2", "CK1.log"))).toBe(true);
    expect(s.porcelain()).toContain(".grace5/changes/closed/");

    // Records keep their paths relative to the change directory, so check and status read the moved change unchanged.
    const after = s.check();
    expect(after.code).toBe(0);
    expect(after.defects).toEqual([]);
    expect(after.contractSha).toBe(before.contractSha);
    expect(after.definitions).toEqual(before.definitions);
    const status = s.status();
    expect(status.code).toBe(0);
    expect(hasLine(status, `closed: ${closedPath(s.id)}/records/close.xml`)).toBe(true);
    expect(hasLine(status, "next: none, the change is closed")).toBe(true);
    expect(hasLine(status, "check CK1: passed, counts")).toBe(true);
    // The move touched nothing outside .grace5/changes/: the candidate is unchanged and the tree is clean.
    expect(hasLine(status, /^candidate: [0-9a-f]{64} \(clean\)$/)).toBe(true);
    expect(status.out).not.toContain("malformed");

    // Committed, the moved change reads the same.
    s.commit("move the closed change");
    expect(s.check().code).toBe(0);
    expect(hasLine(s.status(), `closed: ${closedPath(s.id)}/records/close.xml`)).toBe(true);
    expect(hasLine(s.cli(["status", "--all"]), `${s.id}: closed`)).toBe(true);
  },
  TEST_TIMEOUT,
);

test(
  "CL-02 a closed change refuses run and close with the fixed phrase, under closed/ and when not yet moved",
  () => {
    const s = prepared({ id: "C-0402-refused", checks: [automated("CK1")] });
    closeFully(s);
    expect(fs.existsSync(s.closedChangeDir)).toBe(true);
    const receipts = s.runNumbers();

    for (const args of [["run", s.id], ["run", s.id, "--check", "CK1"], ["run", s.id, "--start"], ["close", s.id]]) {
      const refused = s.cli(args);
      expect(refused.code).toBe(1);
      expect(hasLine(refused, "refused: change is closed")).toBe(true);
    }
    expect(s.runNumbers()).toEqual(receipts);
    // The bare number resolves under closed/ as well.
    expect(hasLine(s.cli(["status", "C-0402"]), `change: ${s.id}`)).toBe(true);
    expect(s.cli(["check", "C-0402"]).code).toBe(0);

    // A pilot that has not taken this version keeps its closed changes as siblings: close.xml alone still closes them.
    fs.renameSync(s.closedChangeDir, s.openChangeDir);
    expect(fs.existsSync(s.closedChangeDir)).toBe(false);
    for (const args of [["run", s.id], ["close", s.id]]) {
      const refused = s.cli(args);
      expect(refused.code).toBe(1);
      expect(hasLine(refused, "refused: change is closed")).toBe(true);
    }
    const status = s.status();
    expect(hasLine(status, `closed: .grace5/changes/${s.id}/records/close.xml`)).toBe(true);
    expect(hasLine(status, "next: none, the change is closed")).toBe(true);
    expect(hasLine(s.cli(["status"]), "closed changes: 1")).toBe(true);
    expect(s.runNumbers()).toEqual(receipts);
  },
  TEST_TIMEOUT,
);

test(
  "CL-03 a directory under closed/ without close.xml is malformed, run and close refuse it, and other changes are unaffected",
  () => {
    const s = prepared({ id: "C-0403-sound", checks: [automated("CK1")] });
    const alone = s.status();

    const stray = "C-0404-stray";
    s.write(`${closedPath(stray)}/contract.xml`, contractXml({ id: stray, checks: [automated("CK1")] }));
    s.commit("a change under closed/ that was never closed");

    const listing = s.cli(["status"]);
    expect(hasLine(listing, new RegExp(`^${s.id}: approved, next: .+$`))).toBe(true);
    expect(hasLine(listing, new RegExp(`^${stray}: malformed: .*close\\.xml.*$`))).toBe(true);
    expect(hasLine(listing, "closed changes: 0")).toBe(true);
    const all = s.cli(["status", "--all"]);
    expect(hasLine(all, new RegExp(`^${stray}: malformed: .*close\\.xml.*$`))).toBe(true);
    expect(hasLine(all, `${stray}: closed`)).toBe(false);

    const strayStatus = s.cli(["status", stray]);
    expect(strayStatus.code).toBe(0);
    expect(hasLine(strayStatus, new RegExp(`^malformed: .*close\\.xml.*$`))).toBe(true);
    expect(hasLine(strayStatus, /^next: change is malformed: .*close\.xml.*$/)).toBe(true);
    const strayCheck = s.check(stray);
    expect(strayCheck.code).toBe(1);
    expect(strayCheck.defects.some((d) => d.includes("close.xml"))).toBe(true);
    for (const args of [["run", stray, "--start"], ["run", stray], ["close", stray]]) {
      const refused = s.cli(args);
      expect(refused.code).toBe(1);
      expect(hasLine(refused, /^refused: change is malformed: .*close\.xml.*$/)).toBe(true);
    }
    expect(fs.existsSync(path.join(s.repo, closedPath(stray), "records", "run-1.xml"))).toBe(false);
    expect(fs.existsSync(path.join(s.repo, closedPath(stray), "records", "close.xml"))).toBe(false);

    // The valid change is untouched and still runs.
    const withStray = s.status();
    expect(withStray.lines).toEqual(alone.lines);
    expect(withStray.out).not.toContain("malformed");
    const run = s.start();
    expect(run.code).toBe(0);
    expect(hasLine(run, "run 1: CK1 passed")).toBe(true);
  },
  TEST_TIMEOUT,
);

test(
  "CL-04 init refuses an id that exists open or closed and writes nothing for it",
  () => {
    const s = prepared({ id: "C-0405-closed", checks: [automated("CK1")] });
    closeFully(s);
    s.commit("move the closed change");
    const closedId = s.id;
    const open = "C-0406-open";
    s.write(`.grace5/changes/${open}/contract.xml`, contractXml({ id: open, checks: [automated("CK1")] }));
    s.commit("a second, open change");
    const clean = s.porcelain();

    for (const id of [closedId, open]) {
      const refused = s.cli(["init", id]);
      expect(refused.code).toBe(1);
      expect(hasLine(refused, new RegExp(`^refused: .*${id}.*$`))).toBe(true);
      expect(refused.out).not.toContain("created:");
    }
    expect(fs.existsSync(path.join(s.repo, ".grace5", "changes", closedId))).toBe(false);
    expect(s.porcelain()).toBe(clean);

    // A new id is created as before.
    const created = s.cli(["init", "C-0407-new"]);
    expect(created.code).toBe(0);
    expect(hasLine(created, "created: .grace5/changes/C-0407-new/contract.xml")).toBe(true);
  },
  TEST_TIMEOUT,
);

test(
  "CL-05 the listing shows the open changes, counts every closed one moved or not, and --all lists them",
  () => {
    const s = prepared({ id: "C-0408-first", checks: [automated("CK1")] });
    const first = s.id;
    closeFully(s);
    s.commit("close the first change");
    const second = "C-0409-second";
    closeSecond(s, { id: second, checks: [automated("CK1")] });
    // The second stays a sibling with close.xml, as a pilot's closed changes do before they are moved.
    fs.renameSync(s.closedChangeDir, s.openChangeDir);
    s.commit("close the second change");
    const open = "C-0410-open";
    s.write(`.grace5/changes/${open}/contract.xml`, contractXml({ id: open, checks: [automated("CK1")] }));
    s.commit("a third, open change");

    const listing = s.cli(["status"]);
    expect(listing.code).toBe(0);
    expect(hasLine(listing, `${open}: unapproved, next: no approval for revision 1`)).toBe(true);
    expect(listing.lines.some((l) => l.startsWith(`${first}:`))).toBe(false);
    expect(listing.lines.some((l) => l.startsWith(`${second}:`))).toBe(false);
    expect(listing.lines.at(-1)).toBe("closed changes: 2");

    const all = s.cli(["status", "--all"]);
    expect(all.code).toBe(0);
    expect(hasLine(all, `${open}: unapproved, next: no approval for revision 1`)).toBe(true);
    expect(hasLine(all, `${first}: closed`)).toBe(true);
    expect(hasLine(all, `${second}: closed`)).toBe(true);
    expect(all.lines.at(-1)).toBe("closed changes: 2");
    expect(all.lines.indexOf(`${open}: unapproved, next: no approval for revision 1`)).toBeLessThan(all.lines.indexOf(`${first}: closed`));

    // --all is a flag of the listing only.
    expect(s.cli(["status", "--all", first]).code).toBe(2);
    expect(s.cli(["check", first, "--all"]).code).toBe(2);
    expect(HEX64.test(s.check(first).contractSha)).toBe(true);
  },
  TEST_TIMEOUT,
);

test(
  "CL-06 a cited rule path under the change's own Affected is not a defect",
  () => {
    const s = new Scenario({ id: "C-0411-retired-rule", checks: [automated("CK1")] });
    // A contract may cite a document it creates or amends, so a citation under its own write boundary need not exist.
    // This is what keeps a closed record readable after the framework retires a document it cited.
    s.writeContract({ id: s.id, paths: ["docs/**"], rule: "docs/retired.md#R-1", checks: [automated("CK1")] });
    const inside = s.check();
    expect(inside.defects).toEqual([]);
    expect(inside.code).toBe(0);

    // Outside the write boundary the same missing citation is still a defect.
    s.writeContract({ id: s.id, paths: ["src/**"], rule: "docs/retired.md#R-1", checks: [automated("CK1")] });
    const outside = s.check();
    expect(hasLine(outside, "defect: constraint K1 cites rule docs/retired.md#R-1, which does not exist")).toBe(true);
    expect(outside.code).toBe(1);
  },
  TEST_TIMEOUT,
);
