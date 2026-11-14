// Conformance cases FS-01 .. FS-06 of models/architecture/conformance.md: the claims a trace, an id-only command or
// a manual observation makes and does not make. Split mechanically from fake-success.test.ts by C-0010; the tests
// are unchanged.

import { afterAll, expect, test } from "bun:test";
import {
  CRITERION_ID,
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
