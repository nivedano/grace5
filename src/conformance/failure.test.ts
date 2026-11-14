// Conformance cases FL-01 .. FL-09 of models/architecture/conformance.md: things that go wrong and must be recorded as what they are.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  HEX40,
  TEST_TIMEOUT,
  attr,
  automated,
  contractXml,
  disposeAll,
  elementTexts,
  hasLine,
  killTree,
  openTags,
  prepared,
  resultAttr,
  resultBlock,
  trace,
  waitFor,
  waitForExit,
  type ContractDef,
} from "./helper";

afterAll(() => disposeAll());

test(
  "FL-01 a run killed outright is reported as interrupted and close refuses",
  async () => {
    const s = prepared({
      id: "C-0101-killed",
      checks: [automated("CK1"), trace("TSLOW", "bun tools/sleep.js 20", "any", { expect: ["MARK-A"], budget: 60 })],
    });
    expect(s.start().code).toBe(0);

    const child = s.cliAsync(["run", s.id, "--check", "TSLOW"]);
    const logDir = path.join(s.recordsDir, "logs", "run-2");
    const started = path.join(s.scratch, "sleep-started");
    // The run reserves its log directory first; the check command notes when it is running.
    const running = await waitFor(() => fs.existsSync(logDir) && fs.existsSync(started), 45_000);
    killTree(child);
    await waitForExit(child, 15_000);
    expect(running).toBe(true);

    // Killed outright: a log directory without a receipt.
    expect(fs.existsSync(logDir)).toBe(true);
    expect(s.hasRecord("run-2.xml")).toBe(false);

    const status = s.status();
    expect(hasLine(status, "interrupted: run-2")).toBe(true);
    // The unfinished check is not a pass and does not count.
    expect(hasLine(status, /^check TSLOW: passed/)).toBe(false);
    expect(hasLine(status, /^check TSLOW: .*, counts$/)).toBe(false);

    const close = s.close();
    expect(close.code).toBe(1);
    expect(hasLine(close, /^refused: .+$/)).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);
  },
  TEST_TIMEOUT,
);

test.skipIf(process.platform === "win32")(
  "FL-01 a run stopped by a signal writes an interrupted receipt (POSIX only)",
  async () => {
    const s = prepared({
      id: "C-0101-signalled",
      checks: [
        automated("CK1"),
        trace("TSLOW", "bun tools/sleep.js 20", "any", { expect: ["MARK-A"], budget: 60 }),
        trace("TLATER", "bun tools/emit.js ordered.log", "any"),
      ],
    });
    expect(s.start().code).toBe(0);

    const child = s.cliAsync(["run", s.id]);
    const started = path.join(s.scratch, "sleep-started");
    const running = await waitFor(() => fs.existsSync(started), 45_000);
    expect(running).toBe(true);
    child.kill("SIGINT");
    await waitForExit(child, 20_000);
    killTree(child);

    expect(s.hasRecord("run-2.xml")).toBe(true);
    const receipt = s.receipt(2);
    expect(attr(receipt, "Run", "status")).toBe("interrupted");
    expect(resultAttr(receipt, "TSLOW", "verdict")).toBe("interrupted");
    expect(resultAttr(receipt, "TLATER", "verdict")).toBe("not-attempted");
    expect(hasLine(s.status(), "interrupted: run-2")).toBe(true);
    expect(s.close().code).toBe(1);
  },
  TEST_TIMEOUT,
);

test(
  "FL-02 a change that starts on a red check records the failure in the start run and proceeds",
  () => {
    const s = prepared({ id: "C-0102-red-start", checks: [automated("CK1", "bun tools/gate.js")] });
    const startHead = s.head();
    const start = s.start();
    // A run in which an executed check did not pass exits 1; it is not a refusal.
    expect(start.code).toBe(1);
    expect(hasLine(start, /^run 1: CK1 failed(: .*)?$/)).toBe(true);
    expect(hasLine(start, /^receipt: .+$/)).toBe(true);
    expect(hasLine(start, /^refused: /)).toBe(false);

    const receipt = s.receipt(1);
    expect(attr(receipt, "Run", "start")).toBe("true");
    expect(attr(receipt, "Run", "status")).toBe("completed");
    expect(attr(receipt, "Run", "source-revision")).toBe(startHead);
    expect(resultAttr(receipt, "CK1", "verdict")).toBe("failed");
    expect(resultAttr(receipt, "CK1", "exit")).toBe("1");
    expect(resultAttr(receipt, "CK1", "claim")).toBeUndefined();
    expect(hasLine(s.status(), `start: ${startHead}`)).toBe(true);

    // The change proceeds: the work is done, the check turns green, the change closes.
    s.changeProduct("fixed");
    const run = s.run("--check", "CK1");
    expect(run.code).toBe(0);
    expect(hasLine(run, "run 2: CK1 passed")).toBe(true);
    s.writeReview();
    const close = s.close();
    expect(close.code).toBe(0);
    expect(attr(s.record("close.xml"), "Close", "start-revision")).toBe(startHead);
  },
  TEST_TIMEOUT,
);

test(
  "FL-03 writing only records and notes after a passing run leaves the candidate unchanged and demands no rerun",
  () => {
    const s = prepared({ id: "C-0103-records-only", checks: [automated("CK1")] });
    expect(s.start().code).toBe(0);
    s.changeProduct("the wanted line");
    expect(s.run().code).toBe(0);
    const before = s.status();
    const candidateLine = before.lines.find((l) => l.startsWith("candidate: "));
    expect(candidateLine).toMatch(/^candidate: [0-9a-f]{64} \(clean\)$/);
    expect(hasLine(before, "check CK1: passed, counts")).toBe(true);
    const revisionBefore = s.head();

    // Receipts, logs, notes and then the review are written and committed: a new revision, the same candidate.
    s.write(`.grace5/changes/${s.id}/notes.md`, "# Notes\n\nSequence and technical detail, never approved.\n");
    s.commit("records and notes");
    s.writeReview();
    s.commit("review record");
    expect(s.head()).not.toBe(revisionBefore);

    const after = s.status();
    expect(after.lines.find((l) => l.startsWith("candidate: "))).toBe(candidateLine ?? "none");
    expect(hasLine(after, "check CK1: passed, counts")).toBe(true);
    expect(after.out).not.toContain("recorded on an earlier candidate");

    const close = s.close();
    expect(close.code).toBe(0);
    // Closed on the evidence of run 2, without a further run.
    expect(s.runNumbers()).toEqual([1, 2]);
    const closeXml = s.record("close.xml");
    const satisfied = openTags(closeXml, "Satisfied").find((t) => /check="CK1"/.test(t)) ?? "";
    expect(satisfied).toMatch(/\srun="2"/);
    expect(attr(closeXml, "Close", "source-revision")).toBe(s.head());
    expect(attr(closeXml, "Close", "candidate")).toBe(attr(s.receipt(2), "Run", "candidate") ?? "none");
  },
  TEST_TIMEOUT,
);

test(
  "FL-04 a material amendment not yet approved, then rejected: bound checks run, amended and new checks are refused, close refuses",
  () => {
    const rev1: ContractDef = {
      id: "C-0104-amendment",
      checks: [automated("CK1"), automated("CK2", "bun tools/pass.js", { budget: 30 })],
    };
    const s = prepared(rev1);
    // An earlier legacy approval still binds its checks, even with the old false flag.
    s.writeApproval({ executes: false });
    expect(s.start().code).toBe(0);

    // Revision 2: CK1 untouched, CK2 amended, CK3 new. No approval yet.
    const rev2: ContractDef = {
      id: rev1.id,
      revision: 2,
      checks: [automated("CK1"), automated("CK2", "bun tools/pass.js", { budget: 31 }), automated("CK3", "bun tools/env.js")],
    };
    s.writeContract(rev2);

    const assertAmendedState = (n: number) => {
      const run = s.run();
      expect(hasLine(run, `run ${n}: CK1 passed`)).toBe(true);
      expect(hasLine(run, `run ${n}: CK2 refused: amended in unapproved revision`)).toBe(true);
      expect(hasLine(run, `run ${n}: CK3 refused: amended in unapproved revision`)).toBe(true);
      expect(run.code).toBe(1);
      const receipt = s.receipt(n);
      expect(resultAttr(receipt, "CK1", "verdict")).toBe("passed");
      for (const id of ["CK2", "CK3"]) {
        const block = resultBlock(receipt, id) ?? "";
        expect(attr(block, "Result", "verdict")).toBe("refused");
        expect(attr(block, "Result", "claim")).toBeUndefined();
        expect(elementTexts(block, "Reason")[0]?.trim()).toBe("amended in unapproved revision");
      }
    };

    assertAmendedState(2);
    expect(hasLine(s.status(), /^revision: 2\b/)).toBe(true);
    expect(hasLine(s.status(), "authorization: unapproved")).toBe(true);
    const pending = s.close();
    expect(pending.code).toBe(1);
    expect(hasLine(pending, "refused: no approval for revision 2")).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);

    // The owner rejects revision 2 on its difference brief.
    s.takeHashes();
    s.writeBrief();
    s.writeApproval({ decision: "rejected" });
    expect(hasLine(s.status(), "authorization: rejected")).toBe(true);
    assertAmendedState(3);
    const rejected = s.close();
    expect(rejected.code).toBe(1);
    expect(hasLine(rejected, /^refused: .+$/)).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);
  },
  TEST_TIMEOUT,
);

test(
  "FL-05 unrelated edits before the start are listed as Preexisting, never staged or committed, and close refuses a dirty tree",
  () => {
    const s = prepared({ id: "C-0105-preexisting", checks: [automated("CK1")] });
    // Someone else's work in progress: one tracked file modified, one untracked file.
    s.write("src/other.txt", "another tracked file\nedited before the change began\n");
    s.write("stray.txt", "left lying around\n");
    // Source paths only: the records the kernel writes under .grace5/changes/ are not source.
    const sourceState = () => s.porcelain().split("\n").filter((l) => l !== "" && !l.includes(".grace5/")).join("\n");
    const porcelain = sourceState();
    expect(porcelain).toContain("src/other.txt");
    expect(porcelain).toContain("stray.txt");
    const head = s.head();

    expect(s.start().code).toBe(0);
    const receipt = s.receipt(1);
    const preexisting = elementTexts(receipt, "Preexisting").map((t) => t.trim().replace(/\\/g, "/")).sort();
    expect(preexisting).toEqual(["src/other.txt", "stray.txt"]);
    expect(attr(receipt, "Run", "start")).toBe("true");
    expect(attr(receipt, "Run", "dirty")).toBe("true");

    // Identified, never adopted: nothing staged, stashed, moved or committed.
    expect(sourceState()).toBe(porcelain);
    expect(s.head()).toBe(head);
    expect(s.git("stash", "list").trim()).toBe("");

    expect(s.run().code).toBe(0);
    expect(attr(s.receipt(2), "Run", "dirty")).toBe("true");
    s.writeReview();
    const status = s.status();
    expect(hasLine(status, /^candidate: [0-9a-f]{64} \(dirty\)$/)).toBe(true);
    expect(hasLine(status, "next: working tree is dirty")).toBe(true);
    const close = s.close();
    expect(close.code).toBe(1);
    expect(hasLine(close, "refused: working tree is dirty")).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);
    expect(sourceState()).toBe(porcelain);
    expect(s.head()).toBe(head);
  },
  TEST_TIMEOUT,
);

test(
  "FL-06 another malformed change does not affect status of a valid change and is reported as malformed",
  () => {
    const s = prepared({ id: "C-0106-good", checks: [automated("CK1")] });
    const alone = s.status();

    const bad = "C-0107-bad";
    // Well-formed XML that is not a contract: six of the eight sections are missing.
    s.write(
      `.grace5/changes/${bad}/contract.xml`,
      `<?xml version="1.0" encoding="UTF-8"?>\n<Contract id="${bad}" revision="1" title="Half a contract">\n  <Problem>Only a problem.</Problem>\n</Contract>\n`,
    );
    s.commit("a second, malformed change");

    const withBad = s.status();
    expect(withBad.code).toBe(alone.code);
    expect(withBad.lines).toEqual(alone.lines);
    expect(hasLine(withBad, `change: ${s.id}`)).toBe(true);
    expect(hasLine(withBad, "authorization: approved")).toBe(true);
    expect(withBad.out).not.toContain("malformed");

    const listing = s.cli(["status"]);
    expect(hasLine(listing, new RegExp(`^${s.id}: approved, next: .+$`))).toBe(true);
    expect(hasLine(listing, new RegExp(`^${bad}: malformed: .+$`))).toBe(true);

    // The gate is strict for the malformed one, and the valid one still runs.
    const badRun = s.cli(["run", bad, "--start"]);
    expect(badRun.code).toBe(1);
    expect(fs.existsSync(path.join(s.repo, ".grace5", "changes", bad, "records", "run-1.xml"))).toBe(false);
    expect(s.cli(["close", bad]).code).toBe(1);
    const goodRun = s.start();
    expect(goodRun.code).toBe(0);
    expect(hasLine(goodRun, "run 1: CK1 passed")).toBe(true);
  },
  TEST_TIMEOUT,
);

test(
  "FL-06 a contract that is not well-formed XML is listed as malformed beside a valid change",
  () => {
    const s = prepared({ id: "C-0106-sound", checks: [automated("CK1")] });
    const bad = "C-0108-broken";
    s.write(`.grace5/changes/${bad}/contract.xml`, contractXml({ id: bad, checks: [automated("CK1")] }).replace("</Contract>", ""));
    s.commit("a second change that does not parse");
    const listing = s.cli(["status"]);
    expect(hasLine(listing, new RegExp(`^${s.id}: approved, next: .+$`))).toBe(true);
    expect(hasLine(listing, new RegExp(`^${bad}: malformed: .+$`))).toBe(true);
    const status = s.status();
    expect(hasLine(status, `change: ${s.id}`)).toBe(true);
    expect(status.out).not.toContain("malformed");
  },
  TEST_TIMEOUT,
);

test(
  "FL-07 a complete diff that touches a protected path is reported by status and close refuses",
  () => {
    const s = prepared({
      id: "C-0107-protected",
      paths: ["src/**"],
      protectedPaths: ["src/secret/**"],
      checks: [automated("CK1")],
    });
    expect(s.start().code).toBe(0);
    expect(hasLine(s.status(), /^protected: /)).toBe(false);

    const original = s.read("src/secret/key.txt");
    s.write("src/secret/key.txt", original + "written by the change\n");
    s.write("docs/note.md", "A note outside the write boundary, edited.\n");
    s.changeProduct("the wanted line");
    expect(s.run().code).toBe(0);
    s.writeReview();

    const status = s.status();
    // Protection wins over the Path that also matches the file.
    expect(hasLine(status, "protected: src/secret/key.txt")).toBe(true);
    expect(hasLine(status, "outside: docs/note.md")).toBe(true);
    expect(hasLine(status, "outside: src/product.txt")).toBe(false);
    expect(hasLine(status, "next: protected path touched: src/secret/key.txt")).toBe(true);
    const close = s.close();
    expect(close.code).toBe(1);
    expect(hasLine(close, "refused: protected path touched: src/secret/key.txt")).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);

    // A file changed and restored is not in the net difference; an outside write does not block.
    s.write("src/secret/key.txt", original);
    s.commit("restore the protected file");
    expect(s.run().code).toBe(0);
    s.writeReview();
    const restored = s.status();
    expect(hasLine(restored, /^protected: /)).toBe(false);
    expect(hasLine(restored, "outside: docs/note.md")).toBe(true);
    expect(s.close().code).toBe(0);
  },
  TEST_TIMEOUT,
);

test(
  "FL-08 a contract edited after approval without a new revision is reported as altered and treated as unapproved",
  () => {
    const s = prepared({ id: "C-0108-altered", checks: [automated("CK1")] });
    expect(s.start().code).toBe(0);
    expect(s.run().code).toBe(0);
    s.writeReview();
    expect(hasLine(s.status(), "authorization: approved")).toBe(true);

    // The same revision number, different bytes.
    const rel = `.grace5/changes/${s.id}/contract.xml`;
    const text = s.read(rel);
    expect(text).toContain("The product file carries the wanted line.");
    s.write(rel, text.replace("The product file carries the wanted line.", "The product file carries the wanted line and a second one."));

    const status = s.status();
    expect(hasLine(status, /^revision: 1\b/)).toBe(true);
    expect(hasLine(status, "authorization: altered after approval")).toBe(true);
    expect(hasLine(status, "authorization: approved")).toBe(false);
    expect(hasLine(status, "next: contract altered after approval")).toBe(true);
    const close = s.close();
    expect(close.code).toBe(1);
    expect(hasLine(close, "refused: contract altered after approval")).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);

    // Restored to the approved text, the hash matches the approval again.
    s.write(rel, text);
    expect(hasLine(s.status(), "authorization: approved")).toBe(true);
    expect(s.close().code).toBe(0);
  },
  TEST_TIMEOUT,
);

test(
  "FL-09 a command that exceeds its budget is killed and recorded cancelled",
  () => {
    const s = prepared({
      id: "C-0109-budget",
      checks: [automated("CKSLOW", "bun tools/sleep.js 20", { budget: 1 }), automated("CK2")],
    });
    const start = s.start();
    expect(start.code).toBe(1);
    expect(hasLine(start, /^run 1: CKSLOW cancelled(: .*)?$/)).toBe(true);
    // Killed: the run did not wait for the twenty-second command or anything it started.
    expect(start.elapsedMs).toBeLessThan(15_000);
    // The run goes on to the next check.
    expect(hasLine(start, "run 1: CK2 passed")).toBe(true);

    const receipt = s.receipt(1);
    expect(attr(receipt, "Run", "status")).toBe("completed");
    expect(resultAttr(receipt, "CKSLOW", "verdict")).toBe("cancelled");
    expect(resultAttr(receipt, "CKSLOW", "claim")).toBeUndefined();
    const elapsed = Number(resultAttr(receipt, "CKSLOW", "elapsed-ms") ?? "NaN");
    expect(elapsed).toBeGreaterThanOrEqual(900);
    expect(elapsed).toBeLessThan(15_000);
    // The command ran: it left its start note. It did not reach the line it prints after sleeping.
    expect(fs.existsSync(path.join(s.scratch, "sleep-started"))).toBe(true);
    const log = resultAttr(receipt, "CKSLOW", "log");
    expect(log).toBeDefined();
    expect(s.readLog(log ?? "").toString("utf8")).not.toContain("MARK-A");

    expect(attr(receipt, "Run", "source-revision")).toMatch(HEX40);
    const close = s.close();
    expect(close.code).toBe(1);
    expect(hasLine(close, "refused: check CKSLOW: current result is cancelled")).toBe(true);
  },
  TEST_TIMEOUT,
);
