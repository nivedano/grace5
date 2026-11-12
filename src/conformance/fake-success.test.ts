// Conformance cases FS-01 .. FS-14 of models/architecture/conformance.md: states that look like success and are not.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  ARCH,
  CRITERION_ID,
  Scenario,
  TEST_TIMEOUT,
  attr,
  automated,
  disposeAll,
  elementTexts,
  hasLine,
  manual,
  openTags,
  prepared,
  resultAttr,
  resultBlock,
  trace,
} from "./helper";

afterAll(() => disposeAll());

test(
  "FS-01 an id-only command that exits 0 claims command-completion and nothing else",
  () => {
    const s = prepared({ id: "C-0001-noop", checks: [automated("CK1")] });
    const start = s.start();
    expect(start.code).toBe(0);
    expect(hasLine(start, "run 1: CK1 passed")).toBe(true);
    // Every line is one of the two documented run lines; nothing speaks of a criterion or of proof.
    for (const line of start.lines) expect(line).toMatch(/^(run 1: CK1 passed|receipt: .+)$/);

    const receipt = s.receipt(1);
    expect(resultAttr(receipt, "CK1", "verdict")).toBe("passed");
    expect(resultAttr(receipt, "CK1", "claim")).toBe("command-completion");
    const block = resultBlock(receipt, "CK1") ?? "";
    expect(openTags(block, "Trace")).toHaveLength(0);
    expect(openTags(block, "Observation")).toHaveLength(0);
    expect(receipt).not.toContain(CRITERION_ID);
    expect(receipt).not.toMatch(/\bproof\b|\bprov(es|ed|en)\b/i);

    const status = s.status();
    expect(status.out).not.toContain(CRITERION_ID);
    expect(status.out).not.toMatch(/\bproof\b|\bprov(es|ed|en)\b/i);
  },
  TEST_TIMEOUT,
);

test(
  "FS-02 trace markers all present but out of order fail and name the first marker not found in order",
  () => {
    const s = prepared({
      id: "C-0002-order",
      checks: [
        automated("CK1"),
        trace("TORDER", "bun tools/emit.js shuffled.log", "any"),
        trace("TGOOD", "bun tools/emit.js ordered.log", "any"),
        trace("TBAD", "bun tools/emit.js bad.log", "any", { forbid: ["MARK-BAD"] }),
      ],
    });
    expect(s.start().code).toBe(0);
    const run = s.run();
    expect(run.code).toBe(1);
    expect(hasLine(run, /^run 2: TORDER failed(: .*)?$/)).toBe(true);
    expect(hasLine(run, "run 2: TGOOD passed")).toBe(true);
    expect(hasLine(run, /^run 2: TBAD failed(: .*)?$/)).toBe(true);

    const receipt = s.receipt(2);
    // The log is B, A, C: A is found, B is not found after it.
    const order = resultBlock(receipt, "TORDER") ?? "";
    expect(attr(order, "Result", "verdict")).toBe("failed");
    expect(attr(order, "Result", "claim")).toBeUndefined();
    expect(attr(order, "Trace", "matched")).toBe("1");
    expect(attr(order, "Trace", "expected")).toBe("3");
    expect(elementTexts(order, "Missing")[0]?.trim()).toBe("MARK-B");

    // Control: the same markers in order pass, so the failure above is about order.
    const good = resultBlock(receipt, "TGOOD") ?? "";
    expect(attr(good, "Result", "verdict")).toBe("passed");
    expect(attr(good, "Trace", "matched")).toBe("3");
    expect(elementTexts(good, "Missing")).toHaveLength(0);

    // A Forbid marker anywhere in the log fails the check and is named.
    const bad = resultBlock(receipt, "TBAD") ?? "";
    expect(attr(bad, "Result", "verdict")).toBe("failed");
    expect(elementTexts(bad, "Forbidden").map((t) => t.trim())).toContain("MARK-BAD");
  },
  TEST_TIMEOUT,
);

test(
  "FS-03 a replayed old log is labelled replay or unattributed, never live, and refused where live is required",
  () => {
    const s = prepared({
      id: "C-0003-replay",
      checks: [
        automated("CK1"),
        // Prints an old log that carries the provenance line of an old run, and reports nothing itself.
        trace("TSILENT", "bun tools/emit.js old.log", "any"),
        // Prints the old log and reports a replay.
        trace("TREPLAY", "bun tools/emit.js old.log replay", "any"),
        trace("TREPLAYOK", "bun tools/emit.js old.log replay", "replay"),
        // The same two commands under a check that requires live provenance.
        trace("TLIVESILENT", "bun tools/emit.js old.log", "live"),
        trace("TLIVEREPLAY", "bun tools/emit.js old.log replay", "live"),
        // A replay check fed a log that reports nothing.
        trace("TREPLAYSILENT", "bun tools/emit.js old.log", "replay"),
      ],
    });
    expect(s.start().code).toBe(0);
    const run = s.run();
    expect(run.code).toBe(1);
    const receipt = s.receipt(2);

    const silent = resultBlock(receipt, "TSILENT") ?? "";
    expect(attr(silent, "Result", "verdict")).toBe("passed");
    expect(attr(silent, "Result", "claim")).toBe("marker-sequence-unattributed");
    expect(attr(silent, "Trace", "origin-source")).toBe("absent");
    expect(attr(silent, "Trace", "run-echo")).toBe("false");
    expect(attr(silent, "Trace", "origin")).toBeUndefined();
    // The old line's device and build belong to the old run and are not observed in this one.
    expect(attr(silent, "Trace", "device-source")).not.toBe("observed");
    expect(attr(silent, "Trace", "build-source")).not.toBe("observed");

    const replay = resultBlock(receipt, "TREPLAY") ?? "";
    expect(attr(replay, "Result", "verdict")).toBe("passed");
    expect(attr(replay, "Result", "claim")).toBe("marker-sequence-replay");
    expect(attr(replay, "Trace", "origin")).toBe("replay");
    expect(attr(replay, "Trace", "origin-source")).toBe("observed");
    expect(attr(replay, "Trace", "run-echo")).toBe("true");

    const replayOk = resultBlock(receipt, "TREPLAYOK") ?? "";
    expect(attr(replayOk, "Result", "verdict")).toBe("passed");
    expect(attr(replayOk, "Result", "claim")).toBe("marker-sequence-replay");

    // Never live: no result of this run claims a live sequence or records a live origin.
    expect(receipt).not.toContain("marker-sequence-live");
    for (const tag of openTags(receipt, "Trace")) expect(tag).not.toMatch(/\sorigin\s*=\s*["']live["']/);

    expect(hasLine(run, "run 2: TLIVESILENT refused: live provenance missing")).toBe(true);
    expect(resultAttr(receipt, "TLIVESILENT", "verdict")).toBe("refused");
    expect(resultAttr(receipt, "TLIVESILENT", "claim")).toBeUndefined();

    expect(hasLine(run, "run 2: TLIVEREPLAY refused: origin is replay, check requires live")).toBe(true);
    expect(resultAttr(receipt, "TLIVEREPLAY", "verdict")).toBe("refused");
    expect(resultAttr(receipt, "TLIVEREPLAY", "claim")).toBeUndefined();

    expect(hasLine(run, /^run 2: TREPLAYSILENT refused: .+$/)).toBe(true);
    expect(resultAttr(receipt, "TREPLAYSILENT", "verdict")).toBe("refused");
  },
  TEST_TIMEOUT,
);

test(
  "FS-04 a live trace with no device identity, or a mismatched one, is refused where the Environment declares it",
  () => {
    const s = prepared({
      id: "C-0004-device",
      environments: [{ id: "E1", device: "DEV-1", text: "The bench board on the desk." }],
      checks: [
        automated("CK1"),
        trace("TNODEV", "bun tools/emit.js ordered.log live", "live", { environment: "E1" }),
        trace("TWRONGDEV", "bun tools/emit.js ordered.log live DEV-2", "live", { environment: "E1" }),
        trace("TRIGHTDEV", "bun tools/emit.js ordered.log live DEV-1", "live", { environment: "E1" }),
      ],
    });
    expect(s.start().code).toBe(0);
    const run = s.run();
    expect(run.code).toBe(1);
    const receipt = s.receipt(2);

    expect(hasLine(run, "run 2: TNODEV refused: identity missing")).toBe(true);
    expect(resultAttr(receipt, "TNODEV", "verdict")).toBe("refused");
    expect(resultAttr(receipt, "TNODEV", "claim")).toBeUndefined();
    // A declared identity is not an observed one.
    expect(attr(resultBlock(receipt, "TNODEV") ?? "", "Trace", "device-source")).not.toBe("observed");

    expect(hasLine(run, "run 2: TWRONGDEV refused: device mismatch")).toBe(true);
    expect(resultAttr(receipt, "TWRONGDEV", "verdict")).toBe("refused");
    expect(resultAttr(receipt, "TWRONGDEV", "claim")).toBeUndefined();

    // Control: the declared device, observed, passes as a live sequence.
    expect(hasLine(run, "run 2: TRIGHTDEV passed")).toBe(true);
    expect(resultAttr(receipt, "TRIGHTDEV", "claim")).toBe("marker-sequence-live");

    const close = s.close();
    expect(close.code).toBe(1);
    expect(hasLine(close, "refused: check TNODEV: current result is refused")).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);
  },
  TEST_TIMEOUT,
);

test(
  "FS-05 a manual observation that is failed, blocked or not-attempted makes close refuse",
  () => {
    const s = prepared({ id: "C-0005-manual", checks: [manual("MK1")] });
    s.start();
    expect(s.hasRecord("run-1.xml")).toBe(true);
    for (const verdict of ["failed", "blocked", "not-attempted"] as const) {
      const obs = s.observe("MK1", verdict, { environment: "The bench machine." });
      expect(hasLine(obs, new RegExp(`^run \\d+: MK1 ${verdict}(: .*)?$`))).toBe(true);
      expect(resultAttr(s.receipt(), "MK1", "verdict")).toBe(verdict);
      expect(resultAttr(s.receipt(), "MK1", "claim")).toBeUndefined();
      const close = s.close();
      expect(close.code).toBe(1);
      expect(hasLine(close, `refused: check MK1: current result is ${verdict}`)).toBe(true);
      expect(s.hasRecord("close.xml")).toBe(false);
    }
  },
  TEST_TIMEOUT,
);

test(
  "FS-06 a manual observation recorded on an earlier candidate is stale and close refuses",
  () => {
    const s = prepared({ id: "C-0006-stale-manual", checks: [automated("CK1"), manual("MK1")] });
    expect(s.start().code).toBe(0);
    const obs = s.observe("MK1", "passed", { environment: "The bench machine." });
    expect(obs.code).toBe(0);
    expect(resultAttr(s.receipt(), "MK1", "verdict")).toBe("passed");
    const before = attr(s.receipt(), "Run", "candidate");

    s.changeProduct("a later product line");
    // The automated check is rerun on the new candidate, so the refusal can only be about the observation.
    expect(s.run().code).toBe(0);
    expect(attr(s.receipt(), "Run", "candidate")).not.toBe(before);
    s.writeReview();

    const status = s.status();
    expect(hasLine(status, "check MK1: passed, does not count: recorded on an earlier candidate")).toBe(true);
    const close = s.close();
    expect(close.code).toBe(1);
    expect(hasLine(close, "refused: check MK1: recorded on an earlier candidate")).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);
  },
  TEST_TIMEOUT,
);

test(
  "FS-06 a manual observation naming a build that does not satisfy the declared one is refused when recorded",
  () => {
    const s = prepared({
      id: "C-0006-wrong-build",
      environments: [{ id: "E1", device: "DEV-1", build: "@revision", text: "The bench board, flashed with the candidate build." }],
      checks: [manual("MK1", { environment: "E1" })],
    });
    s.start();
    const wrong = s.observe("MK1", "passed", { build: "app-not-this-build" });
    expect(hasLine(wrong, /^run 2: MK1 refused: build mismatch$/)).toBe(true);
    expect(wrong.code).toBe(1);
    const receipt = s.receipt(2);
    expect(resultAttr(receipt, "MK1", "verdict")).toBe("refused");
    expect(resultAttr(receipt, "MK1", "claim")).toBeUndefined();

    const close = s.close();
    expect(close.code).toBe(1);
    expect(hasLine(close, "refused: check MK1: current result is refused")).toBe(true);

    // Control: a build identity that contains the abbreviated source revision is accepted.
    const right = s.observe("MK1", "passed", { build: `app-${s.head().slice(0, 8)}-release` });
    expect(right.code).toBe(0);
    expect(hasLine(right, "run 3: MK1 passed")).toBe(true);
    expect(resultAttr(s.receipt(3), "MK1", "claim")).toBe("observation");
  },
  TEST_TIMEOUT,
);

test(
  "FS-07 an unresolved blocking finding in the current review makes close refuse",
  () => {
    const s = prepared({ id: "C-0007-finding", checks: [automated("CK1")] });
    expect(s.start().code).toBe(0);
    expect(s.run().code).toBe(0);
    s.writeReview({ findings: [{ id: "F1", severity: "blocking", status: "open" }] });

    const status = s.status();
    expect(hasLine(status, "next: blocking finding F1 is open")).toBe(true);
    const close = s.close();
    expect(close.code).toBe(1);
    expect(hasLine(close, "refused: blocking finding F1 is open")).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);

    // Control: a later review pass with the finding resolved is the current one, and the change closes.
    s.writeReview({ findings: [{ id: "F1", severity: "blocking", status: "resolved" }] });
    const closed = s.close();
    expect(closed.code).toBe(0);
    expect(s.hasRecord("close.xml")).toBe(true);
  },
  TEST_TIMEOUT,
);

test(
  "FS-08 a review that covers an earlier candidate makes close refuse",
  () => {
    const s = prepared({ id: "C-0008-old-review", checks: [automated("CK1")] });
    expect(s.start().code).toBe(0);
    expect(s.run().code).toBe(0);
    s.writeReview();

    s.changeProduct("a line written after the review");
    // Fresh evidence on the new candidate: only the review is behind.
    expect(s.run().code).toBe(0);

    const close = s.close();
    expect(close.code).toBe(1);
    expect(hasLine(close, "refused: review covers an earlier candidate")).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);

    // Control: a review of the final candidate closes it.
    s.writeReview();
    expect(s.close().code).toBe(0);
  },
  TEST_TIMEOUT,
);

test(
  "FS-09 a skipped check is never counted as passed",
  () => {
    const s = prepared({ id: "C-0009-skipped", checks: [automated("CK1")] });
    expect(s.start().code).toBe(0);
    expect(s.run().code).toBe(0);
    expect(resultAttr(s.receipt(2), "CK1", "verdict")).toBe("passed");

    const skip = s.run("--skip", "CK1", "--note", "The build machine is away today.");
    expect(hasLine(skip, /^run 3: CK1 skipped(: .*)?$/)).toBe(true);
    const receipt = s.receipt(3);
    expect(resultAttr(receipt, "CK1", "verdict")).toBe("skipped");
    expect(resultAttr(receipt, "CK1", "claim")).toBeUndefined();
    s.writeReview();

    const status = s.status();
    expect(hasLine(status, /^check CK1: skipped, does not count(: .*)?$/)).toBe(true);
    expect(hasLine(status, /^check CK1: .*, counts$/)).toBe(false);
    const close = s.close();
    expect(close.code).toBe(1);
    expect(hasLine(close, "refused: check CK1: current result is skipped")).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);
  },
  TEST_TIMEOUT,
);

test(
  "FS-09 a cancelled check is never counted as passed",
  () => {
    const s = prepared({
      id: "C-0009-cancelled",
      checks: [automated("CK1"), trace("TSLOW", "bun tools/sleep.js 8", "any", { expect: ["MARK-A"], budget: 1 })],
    });
    expect(s.start().code).toBe(0);
    const run = s.run();
    expect(run.code).toBe(1);
    expect(hasLine(run, "run 2: CK1 passed")).toBe(true);
    expect(hasLine(run, /^run 2: TSLOW cancelled(: .*)?$/)).toBe(true);
    const receipt = s.receipt(2);
    expect(resultAttr(receipt, "TSLOW", "verdict")).toBe("cancelled");
    expect(resultAttr(receipt, "TSLOW", "claim")).toBeUndefined();
    s.writeReview();

    const status = s.status();
    expect(hasLine(status, /^check TSLOW: cancelled, does not count(: .*)?$/)).toBe(true);
    const close = s.close();
    expect(close.code).toBe(1);
    expect(hasLine(close, "refused: check TSLOW: current result is cancelled")).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);
  },
  TEST_TIMEOUT,
);

test(
  "FS-10 receipts that passed on an earlier candidate are stale after the source changed and close refuses",
  () => {
    const s = prepared({ id: "C-0010-stale", checks: [automated("CK1")] });
    expect(s.start().code).toBe(0);
    expect(s.run().code).toBe(0);
    s.writeReview();
    expect(hasLine(s.status(), "check CK1: passed, counts")).toBe(true);

    s.changeProduct("a line written after the passing run");

    const status = s.status();
    expect(hasLine(status, "check CK1: passed, does not count: recorded on an earlier candidate")).toBe(true);
    const close = s.close();
    expect(close.code).toBe(1);
    expect(hasLine(close, "refused: check CK1: recorded on an earlier candidate")).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);
  },
  TEST_TIMEOUT,
);

test(
  "FS-11 a manual-only change with a procedure and no recorded observation makes close refuse",
  () => {
    const s = prepared({ id: "C-0011-no-observation", checks: [manual("MK1")] });
    s.start();
    expect(s.hasRecord("run-1.xml")).toBe(true);
    // The start run does not touch a manual check.
    expect(resultBlock(s.receipt(1), "MK1")).toBeUndefined();
    s.writeReview();

    const status = s.status();
    expect(hasLine(status, /^check MK1: .*counts$/)).toBe(false);
    const close = s.close();
    expect(close.code).toBe(1);
    expect(hasLine(close, "refused: check MK1: no result")).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);
  },
  TEST_TIMEOUT,
);

test(
  "FS-12 no approval for the current revision: run and close refuse",
  () => {
    const s = new Scenario({ id: "C-0012-no-approval", checks: [automated("CK1")] });
    s.takeHashes();
    s.writeBrief();
    s.commit("a contract and a brief, no approval");

    expect(hasLine(s.status(), "authorization: unapproved")).toBe(true);
    const start = s.start();
    expect(start.code).toBe(1);
    expect(hasLine(start, "refused: no approval for revision 1")).toBe(true);
    expect(s.runNumbers()).toHaveLength(0);

    const close = s.close();
    expect(close.code).toBe(1);
    expect(hasLine(close, "refused: no approval for revision 1")).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);
  },
  TEST_TIMEOUT,
);

test(
  "FS-12 no brief for the current revision, or a brief edited after approval: close refuses",
  () => {
    const s = prepared({ id: "C-0012-no-brief", checks: [automated("CK1")] });
    expect(s.start().code).toBe(0);
    expect(s.run().code).toBe(0);
    s.writeReview();

    // The brief the owner read is edited afterwards: its hash no longer equals the approval's.
    const briefRel = `.grace5/changes/${s.id}/records/brief-1.html`;
    const original = s.read(briefRel);
    s.write(briefRel, original.replace("The fixture checks say little about a real product.", "There are no risks at all."));
    const edited = s.close();
    expect(edited.code).toBe(1);
    expect(hasLine(edited, "refused: brief does not match the approval")).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);

    // No brief at all.
    fs.rmSync(path.join(s.repo, briefRel));
    const missing = s.close();
    expect(missing.code).toBe(1);
    expect(hasLine(missing, "refused: no brief for revision 1")).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);

    // Control: with the brief the owner read back in place, the change closes.
    s.write(briefRel, original);
    expect(s.close().code).toBe(0);
  },
  TEST_TIMEOUT,
);

test(
  "FS-13 a pass followed by a later failure of the same check on the same candidate: the failure is current and close refuses",
  () => {
    const s = prepared({ id: "C-0013-later-failure", checks: [automated("CK1", "bun tools/flag.js")] });
    expect(s.start().code).toBe(0);
    const pass = s.run();
    expect(pass.code).toBe(0);
    expect(hasLine(pass, "run 2: CK1 passed")).toBe(true);

    // Nothing in the source changes: the flag lives outside the repository.
    fs.writeFileSync(path.join(s.scratch, "fail-flag"), "set");
    const fail = s.run("--check", "CK1");
    expect(fail.code).toBe(1);
    expect(hasLine(fail, /^run 3: CK1 failed(: .*)?$/)).toBe(true);
    expect(attr(s.receipt(3), "Run", "candidate")).toBe(attr(s.receipt(2), "Run", "candidate") ?? "none");
    expect(attr(s.receipt(3), "Run", "dirty")).toBe("false");
    s.writeReview();

    const status = s.status();
    expect(hasLine(status, /^check CK1: failed, does not count(: .*)?$/)).toBe(true);
    expect(hasLine(status, /^check CK1: passed/)).toBe(false);
    const close = s.close();
    expect(close.code).toBe(1);
    expect(hasLine(close, "refused: check CK1: current result is failed")).toBe(true);
    expect(s.hasRecord("close.xml")).toBe(false);
  },
  TEST_TIMEOUT,
);

test(
  "FS-14 check reports a brief that omits a protected path",
  () => {
    const s = new Scenario({
      id: "C-0014-brief",
      protectedPaths: ["src/secret/**", "docs/frozen.md"],
      checks: [automated("CK1"), manual("MK1")],
    });
    s.takeHashes();
    s.writeBrief({ omitProtected: ["src/secret/**"] });
    const defective = s.check();
    expect(defective.code).toBe(1);
    expect(hasLine(defective, "defect: brief-1.html: protected path src/secret/** is missing")).toBe(true);
    expect(defective.out).not.toContain("protected path docs/frozen.md is missing");

    // Control: the complete brief has no defect.
    s.writeBrief();
    const complete = s.check();
    expect(complete.defects).toEqual([]);
    expect(complete.code).toBe(0);
  },
  TEST_TIMEOUT,
);

test(
  "FS-14 check exposes the omitted protected path of examples/defective-brief",
  () => {
    const id = "C-0004-bringup-trace";
    const s = new Scenario({ id: "C-0001-bystander", checks: [automated("CK1")] });
    // The rule file the example contract cites must exist, so the brief defect is the only one.
    s.write("docs/design-rules.md", "# Design rules\n\nDR-FW-3 and DR-FW-9 live here.\n");
    const install = (example: string) => {
      const from = path.join(ARCH, "examples", example);
      s.write(`.grace5/changes/${id}/contract.xml`, fs.readFileSync(path.join(from, "contract.xml"), "utf8"));
      s.write(`.grace5/changes/${id}/records/brief-1.html`, fs.readFileSync(path.join(from, "records", "brief-1.html"), "utf8"));
    };

    install("defective-brief");
    const defective = s.check(id);
    expect(defective.code).toBe(1);
    expect(hasLine(defective, "defect: brief-1.html: protected path src/firmware/components/** is missing")).toBe(true);

    // Control: the sound brief of the same contract, examples/D-trace-boot, is not reported.
    install("D-trace-boot");
    const sound = s.check(id);
    expect(sound.out).not.toContain("protected path src/firmware/components/** is missing");
    expect(sound.defects).toEqual([]);
    expect(sound.code).toBe(0);
    // What the example brief states about its contract is what check counts.
    expect(sound.contractSha).toBe("a84e29f141b785c3d30e9491c7590c9aeb50e6bddfa37f15171f537a6362bf6b");
    expect(sound.words).toBe(498);
    expect(sound.checks).toBe(3);
  },
  TEST_TIMEOUT,
);
