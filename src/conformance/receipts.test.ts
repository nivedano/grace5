// The happy path, every receipt field of evidence-records.md and trace-provenance.md, and the fixed lines of commands.md.

import { afterAll, expect, test } from "bun:test";
import {
  HEX40,
  HEX64,
  ISO_DATETIME,
  Scenario,
  TEST_TIMEOUT,
  attr,
  attrOf,
  automated,
  canonicalDefinition,
  disposeAll,
  elementTexts,
  hasLine,
  manual,
  openTags,
  prepared,
  resultAttr,
  resultBlock,
  sha256,
  trace,
  xmlUnescape,
  type CheckInfo,
  type CliResult,
  type ContractDef,
} from "./helper";

afterAll(() => disposeAll());

const HAPPY: ContractDef = {
  id: "C-0201-happy",
  paths: ["src/**"],
  protectedPaths: ["src/secret/**"],
  environments: [{ id: "E1", device: "DEV-1", build: "@revision", text: "The bench board on the desk, flashed with the candidate build." }],
  checks: [
    automated("CK1", "bun tools/env.js"),
    trace("TLIVE", "bun tools/emit.js ordered.log live DEV-1 @rev", "live", { environment: "E1", forbid: ["MARK-BAD"] }),
    manual("MK1", { environment: "E1" }),
    automated("CKOPT", "bun tools/fail.js", { required: false }),
    trace("TDECL", "bun tools/emit.js ordered.log", "any", { environment: "E1", required: false }),
  ],
};

interface Happy {
  s: Scenario;
  info: CheckInfo;
  startHead: string;
  finalHead: string;
  candidate: string;
  start: CliResult;
  finalRun: CliResult;
  observation: CliResult;
  statusBefore: CliResult;
  close: CliResult;
  statusAfter: CliResult;
  runAfterClose: CliResult;
}

let happyCache: Happy | undefined;

/** One change with an automated, a live trace and a manual check, taken from preparation to close. Built once. */
function happy(): Happy {
  if (happyCache !== undefined) return happyCache;
  const s = new Scenario(HAPPY);
  const info = s.prepare();
  const startHead = s.head();
  const start = s.start();
  const finalHead = s.changeProduct("the wanted line");
  const candidate = s.computeCandidate();
  const finalRun = s.run();
  const observation = s.observe("MK1", "passed", {
    by: "Ada Bench",
    build: `app-${finalHead.slice(0, 8)}`,
    reference: "photo-17.jpg",
    note: "The wanted line was read aloud from the product file.",
  });
  s.writeReview();
  const statusBefore = s.status();
  const close = s.close();
  const statusAfter = s.status();
  const runAfterClose = s.run();
  happyCache = { s, info, startHead, finalHead, candidate, start, finalRun, observation, statusBefore, close, statusAfter, runAfterClose };
  return happyCache;
}

function isoMs(value: string | undefined): number {
  expect(value).toMatch(ISO_DATETIME);
  return Date.parse(value ?? "");
}

test(
  "HAPPY a change with one automated, one live trace and one manual check closes and close.xml names what satisfied it",
  () => {
    const h = happy();
    // The optional failing check makes the start run and the final run exit 1; nothing is refused.
    expect(hasLine(h.start, "run 1: CK1 passed")).toBe(true);
    expect(hasLine(h.finalRun, "run 2: CK1 passed")).toBe(true);
    expect(hasLine(h.finalRun, "run 2: TLIVE passed")).toBe(true);
    expect(hasLine(h.finalRun, /^run 2: CKOPT failed(: .*)?$/)).toBe(true);
    expect(hasLine(h.finalRun, /^receipt: .*run-2\.xml$/)).toBe(true);
    expect(h.finalRun.code).toBe(1);
    expect(hasLine(h.observation, "run 3: MK1 passed")).toBe(true);
    expect(h.observation.code).toBe(0);

    expect(h.close.out).not.toMatch(/^refused:/m);
    expect(h.close.code).toBe(0);
    expect(hasLine(h.close, /^closed: .*close\.xml$/)).toBe(true);
    expect(h.s.hasRecord("close.xml")).toBe(true);

    const xml = h.s.record("close.xml");
    expect(attr(xml, "Close", "change")).toBe(HAPPY.id);
    expect(attr(xml, "Close", "revision")).toBe("1");
    expect(attr(xml, "Close", "contract-sha256")).toBe(h.info.contractSha);
    expect(attr(xml, "Close", "date")).toMatch(ISO_DATETIME);
    expect(attr(xml, "Close", "source-revision")).toBe(h.finalHead);
    expect(attr(xml, "Close", "candidate")).toBe(h.candidate);
    expect(attr(xml, "Close", "start-revision")).toBe(h.startHead);
    expect(attr(xml, "Close", "brief")).toContain("brief-1.html");
    expect(attr(xml, "Close", "approval")).toContain("approval-1.xml");
    expect(attr(xml, "Close", "review")).toBe("1");
    expect((attr(xml, "Close", "kernel") ?? "").trim()).not.toBe("");

    const satisfied = new Map<string, string>();
    for (const tag of openTags(xml, "Satisfied")) satisfied.set(attrOf(tag, "check") ?? "", tag);
    expect([...satisfied.keys()].sort()).toEqual(["CK1", "MK1", "TLIVE"]);
    const expectSatisfied = (check: string, kind: string, run: string, claim: string) => {
      const tag = satisfied.get(check) ?? "";
      expect(attrOf(tag, "kind")).toBe(kind);
      expect(attrOf(tag, "run")).toBe(run);
      expect(attrOf(tag, "claim")).toBe(claim);
    };
    expectSatisfied("CK1", "automated", "2", "command-completion");
    expectSatisfied("TLIVE", "trace", "2", "marker-sequence-live");
    expectSatisfied("MK1", "manual", "3", "observation");

    // Optional checks are listed with their latest verdict and never counted.
    const notRequired = new Map<string, string>();
    for (const tag of openTags(xml, "NotRequired")) notRequired.set(attrOf(tag, "check") ?? "", attrOf(tag, "verdict") ?? "");
    expect(notRequired.get("CKOPT")).toBe("failed");
    expect(notRequired.get("TDECL")).toBe("passed");
    expect(notRequired.size).toBe(2);
  },
  TEST_TIMEOUT,
);

test(
  "RECEIPT Run attributes: binding, numbering, run id, interval, status, start, source revision, dirty, candidate, kernel",
  () => {
    const h = happy();
    const r1 = h.s.receipt(1);
    const r2 = h.s.receipt(2);
    for (const [n, r, head] of [["1", r1, h.startHead], ["2", r2, h.finalHead]] as const) {
      expect(attr(r, "Run", "change")).toBe(HAPPY.id);
      expect(attr(r, "Run", "revision")).toBe("1");
      expect(attr(r, "Run", "contract-sha256")).toBe(h.info.contractSha);
      expect(attr(r, "Run", "n")).toBe(n);
      expect((attr(r, "Run", "run-id") ?? "").trim()).not.toBe("");
      const started = isoMs(attr(r, "Run", "started"));
      const ended = isoMs(attr(r, "Run", "ended"));
      expect(ended).toBeGreaterThanOrEqual(started);
      expect(attr(r, "Run", "status")).toBe("completed");
      expect(attr(r, "Run", "source-revision")).toBe(head);
      expect(attr(r, "Run", "source-revision")).toMatch(HEX40);
      expect(attr(r, "Run", "dirty")).toBe("false");
      expect(attr(r, "Run", "candidate")).toMatch(HEX64);
      expect((attr(r, "Run", "kernel") ?? "").trim()).not.toBe("");
    }
    expect(attr(r1, "Run", "start")).toBe("true");
    expect(attr(r2, "Run", "start") ?? "false").toBe("false");
    // A fresh run id per run.
    expect(attr(r1, "Run", "run-id")).not.toBe(attr(r2, "Run", "run-id") ?? "");
    // The candidate is the documented hash over the source tree, and the product commit changed it.
    expect(attr(r1, "Run", "candidate")).toBe(h.s.computeCandidate(h.startHead));
    expect(attr(r2, "Run", "candidate")).toBe(h.candidate);
    expect(attr(r1, "Run", "candidate")).not.toBe(h.candidate);
    // The start run executes the automated checks and no trace or manual check.
    expect(resultBlock(r1, "CK1")).toBeDefined();
    expect(resultBlock(r1, "CKOPT")).toBeDefined();
    expect(resultBlock(r1, "TLIVE")).toBeUndefined();
    expect(resultBlock(r1, "MK1")).toBeUndefined();
    // A plain run does not touch manual checks.
    expect(resultBlock(r2, "MK1")).toBeUndefined();
  },
  TEST_TIMEOUT,
);

test(
  "RECEIPT Result attributes: check, kind, required, definition hash, verdict, claim, cwd, exit, elapsed, log, log hash, environment",
  () => {
    const h = happy();
    const r2 = h.s.receipt(2);

    expect(resultAttr(r2, "CK1", "check")).toBe("CK1");
    expect(resultAttr(r2, "CK1", "kind")).toBe("automated");
    expect(resultAttr(r2, "CK1", "required")).toBe("true");
    expect(resultAttr(r2, "CK1", "definition-sha256")).toBe(h.info.definitions["CK1"] ?? "none");
    expect(resultAttr(r2, "CK1", "verdict")).toBe("passed");
    expect(resultAttr(r2, "CK1", "claim")).toBe("command-completion");
    expect(resultAttr(r2, "CK1", "cwd")).toBe(".");
    expect(resultAttr(r2, "CK1", "exit")).toBe("0");
    expect(resultAttr(r2, "CK1", "elapsed-ms")).toMatch(/^\d+$/);

    for (const check of ["CK1", "TLIVE", "CKOPT", "TDECL"]) {
      const log = resultAttr(r2, check, "log") ?? "";
      expect(log.replace(/\\/g, "/")).toContain("logs/run-2/");
      expect(resultAttr(r2, check, "log-sha256")).toBe(sha256(h.s.readLog(log)));
    }

    expect(resultAttr(r2, "CKOPT", "kind")).toBe("automated");
    expect(resultAttr(r2, "CKOPT", "required")).toBe("false");
    expect(resultAttr(r2, "CKOPT", "verdict")).toBe("failed");
    expect(resultAttr(r2, "CKOPT", "exit")).toBe("1");
    expect(resultAttr(r2, "CKOPT", "claim")).toBeUndefined();

    expect(resultAttr(r2, "TLIVE", "kind")).toBe("trace");
    expect(resultAttr(r2, "TLIVE", "verdict")).toBe("passed");
    expect(resultAttr(r2, "TLIVE", "claim")).toBe("marker-sequence-live");
    expect(resultAttr(r2, "TLIVE", "exit")).toBe("0");
    // The declared environment identity is copied onto results of checks that name an Environment, and only those.
    expect(resultAttr(r2, "TLIVE", "environment")).toMatch(/E1|DEV-1|bench board/);
    expect(resultAttr(h.s.receipt(3), "MK1", "environment")).toMatch(/E1|DEV-1|bench board/);
    expect(resultAttr(r2, "CK1", "environment")).toBeUndefined();
  },
  TEST_TIMEOUT,
);

test(
  "RECEIPT Definition holds the canonical definition text and definition-sha256 is its hash",
  () => {
    const h = happy();
    const r2 = h.s.receipt(2);
    const r3 = h.s.receipt(3);
    const cases: [string, string][] = [
      ["CK1", r2],
      ["TLIVE", r2],
      ["CKOPT", r2],
      ["TDECL", r2],
      ["MK1", r3],
    ];
    for (const [check, receipt] of cases) {
      const canonical = canonicalDefinition(HAPPY, check);
      const block = resultBlock(receipt, check) ?? "";
      const definition = (elementTexts(block, "Definition")[0] ?? "").replace(/\r\n/g, "\n").trim();
      expect(definition).toBe(canonical.trim());
      expect(attr(block, "Result", "definition-sha256")).toBe(sha256(canonical));
      expect(h.info.definitions[check]).toBe(sha256(canonical));
    }
    // The documented shape, spelled out once.
    expect(canonicalDefinition(HAPPY, "TLIVE")).toBe(
      [
        "kind=trace",
        "id=TLIVE",
        "required=true",
        "cwd=.",
        "budget=30",
        "origin=live",
        "environment=E1|DEV-1|@revision|The bench board on the desk, flashed with the candidate build.",
        "command=bun tools/emit.js ordered.log live DEV-1 @rev",
        "expect=1,|MARK-A",
        "expect=1,|MARK-B",
        "expect=1,|MARK-C",
        "forbid=MARK-BAD",
        "",
      ].join("\n"),
    );
  },
  TEST_TIMEOUT,
);

test(
  "RECEIPT Trace provenance fields: origin, origin-source, run-echo, capture interval, device, build, matched, expected",
  () => {
    const h = happy();
    const r2 = h.s.receipt(2);
    const live = resultBlock(r2, "TLIVE") ?? "";
    expect(attr(live, "Trace", "origin")).toBe("live");
    expect(attr(live, "Trace", "origin-source")).toBe("observed");
    expect(attr(live, "Trace", "run-echo")).toBe("true");
    const started = isoMs(attr(live, "Trace", "capture-started"));
    const ended = isoMs(attr(live, "Trace", "capture-ended"));
    expect(ended).toBeGreaterThanOrEqual(started);
    expect(started).toBeGreaterThanOrEqual(isoMs(attr(r2, "Run", "started")) - 1000);
    expect(ended).toBeLessThanOrEqual(isoMs(attr(r2, "Run", "ended")) + 1000);
    expect(attr(live, "Trace", "device")).toBe("DEV-1");
    expect(attr(live, "Trace", "device-source")).toBe("observed");
    expect(attr(live, "Trace", "build")).toBe(`app-${h.finalHead.slice(0, 8)}`);
    expect(attr(live, "Trace", "build-source")).toBe("observed");
    expect(attr(live, "Trace", "matched")).toBe("3");
    expect(attr(live, "Trace", "expected")).toBe("3");
    expect(elementTexts(live, "Missing")).toHaveLength(0);
    expect(elementTexts(live, "Forbidden")).toHaveLength(0);
    // The provenance line in the captured log echoes this run's id.
    const log = h.s.readLog(attr(live, "Result", "log") ?? "").toString("utf8");
    expect(log).toContain(`grace5-provenance: origin=live run=${attr(r2, "Run", "run-id") ?? "none"} device=DEV-1 build=app-${h.finalHead.slice(0, 8)}`);

    // No provenance line: origin absent, identities only declared by the Environment, the claim unattributed.
    const declared = resultBlock(r2, "TDECL") ?? "";
    expect(attr(declared, "Result", "verdict")).toBe("passed");
    expect(attr(declared, "Result", "claim")).toBe("marker-sequence-unattributed");
    expect(attr(declared, "Trace", "origin")).toBeUndefined();
    expect(attr(declared, "Trace", "origin-source")).toBe("absent");
    expect(attr(declared, "Trace", "run-echo")).toBe("false");
    expect(attr(declared, "Trace", "device")).toBe("DEV-1");
    expect(attr(declared, "Trace", "device-source")).toBe("declared");
    expect(attr(declared, "Trace", "build-source")).toBe("declared");
    expect(attr(declared, "Trace", "capture-started")).toMatch(ISO_DATETIME);
    expect(attr(declared, "Trace", "capture-ended")).toMatch(ISO_DATETIME);
    expect(attr(declared, "Trace", "matched")).toBe("3");
    expect(attr(declared, "Trace", "expected")).toBe("3");
  },
  TEST_TIMEOUT,
);

test(
  "RECEIPT Observation fields: by, at, build, environment, reference and what was seen",
  () => {
    const h = happy();
    const r3 = h.s.receipt(3);
    expect(attr(r3, "Run", "candidate")).toBe(h.candidate);
    expect(attr(r3, "Run", "source-revision")).toBe(h.finalHead);
    expect(attr(r3, "Run", "dirty")).toBe("false");
    const block = resultBlock(r3, "MK1") ?? "";
    expect(attr(block, "Result", "kind")).toBe("manual");
    expect(attr(block, "Result", "required")).toBe("true");
    expect(attr(block, "Result", "verdict")).toBe("passed");
    expect(attr(block, "Result", "claim")).toBe("observation");
    expect(attr(block, "Result", "definition-sha256")).toBe(h.info.definitions["MK1"] ?? "none");
    expect(attr(block, "Observation", "by")).toBe("Ada Bench");
    expect(attr(block, "Observation", "at")).toMatch(ISO_DATETIME);
    expect(attr(block, "Observation", "build")).toBe(`app-${h.finalHead.slice(0, 8)}`);
    // --environment was not given: it defaults to the text of the check's declared Environment.
    expect(attr(block, "Observation", "environment")).toBe("The bench board on the desk, flashed with the candidate build.");
    expect(attr(block, "Observation", "reference")).toBe("photo-17.jpg");
    expect(elementTexts(block, "Observation")[0]?.trim()).toBe("The wanted line was read aloud from the product file.");
    expect(openTags(block, "Trace")).toHaveLength(0);
  },
  TEST_TIMEOUT,
);

test(
  "RECEIPT check commands receive GRACE5_RUN_ID, GRACE5_CHANGE, GRACE5_CHECK, GRACE5_SOURCE_REVISION and GRACE5_CANDIDATE",
  () => {
    const h = happy();
    const r2 = h.s.receipt(2);
    const log = h.s.readLog(resultAttr(r2, "CK1", "log") ?? "").toString("utf8");
    const value = (name: string) => new RegExp(`^${name}=(.*)$`, "m").exec(log)?.[1]?.trim();
    expect(value("GRACE5_CHANGE")).toBe(HAPPY.id);
    expect(value("GRACE5_CHECK")).toBe("CK1");
    expect(value("GRACE5_SOURCE_REVISION")).toBe(h.finalHead);
    expect(value("GRACE5_CANDIDATE")).toBe(h.candidate);
    expect(value("GRACE5_RUN_ID")).toBe(attr(r2, "Run", "run-id") ?? "none");
    expect(value("GRACE5_RUN_ID")).not.toBe("<unset>");
  },
  TEST_TIMEOUT,
);

test(
  "STATUS prints the documented lines, with next last, and closed once the change is closed",
  () => {
    const h = happy();
    const before = h.statusBefore;
    expect(hasLine(before, `change: ${HAPPY.id}`)).toBe(true);
    expect(hasLine(before, /^revision: 1\b/)).toBe(true);
    expect(hasLine(before, "authorization: approved for execution")).toBe(true);
    expect(hasLine(before, `start: ${h.startHead}`)).toBe(true);
    expect(hasLine(before, `candidate: ${h.candidate} (clean)`)).toBe(true);
    expect(hasLine(before, "check CK1: passed, counts")).toBe(true);
    expect(hasLine(before, "check TLIVE: passed, counts")).toBe(true);
    expect(hasLine(before, "check MK1: passed, counts")).toBe(true);
    expect(hasLine(before, /^check CKOPT: failed, does not count(: .*)?$/)).toBe(true);
    expect(hasLine(before, /^review: .+$/)).toBe(true);
    expect(hasLine(before, /^protected: /)).toBe(false);
    expect(hasLine(before, /^interrupted: /)).toBe(false);
    expect(hasLine(before, /^closed:/)).toBe(false);
    expect(before.lines.at(-1)).toMatch(/^next: /);
    expect(before.lines.filter((l) => l.startsWith("next: "))).toHaveLength(1);

    expect(hasLine(h.statusAfter, /^closed: .+$/)).toBe(true);
    expect(h.statusAfter.lines.at(-1)).toMatch(/^next: /);
  },
  TEST_TIMEOUT,
);

test(
  "CLOSED a closed change refuses further runs",
  () => {
    const h = happy();
    expect(h.runAfterClose.code).toBe(1);
    expect(hasLine(h.runAfterClose, /^refused: .+$/)).toBe(true);
    expect(h.s.runNumbers()).toEqual([1, 2, 3]);
  },
  TEST_TIMEOUT,
);

test(
  "CHECK prints the contract hash, each definition hash and the size against target",
  () => {
    const h = happy();
    // The happy change is closed by now, so its directory has moved under closed/ (CL-01).
    const contract = h.s.contractText();
    expect(h.info.code).toBe(0);
    expect(h.info.defects).toEqual([]);
    expect(h.info.contractSha).toBe(sha256(contract));
    expect(Object.keys(h.info.definitions).sort()).toEqual(HAPPY.checks.map((c) => c.id).sort());
    for (const c of HAPPY.checks) expect(h.info.definitions[c.id]).toBe(sha256(canonicalDefinition(HAPPY, c.id)));
    // Words are the whitespace-separated tokens of all element text, attribute values excluded; optional checks are counted.
    const text = xmlUnescape(contract.replace(/<\?[\s\S]*?\?>/g, " ").replace(/<[^>]*>/g, " "));
    const words = text.split(/\s+/).filter((t) => t !== "").length;
    expect(hasLine(h.info, `words: ${words} (target 600)`)).toBe(true);
    expect(hasLine(h.info, "checks: 5 (target 8)")).toBe(true);

    // The prepared change, with its brief and approval, is still without defect.
    const again = h.s.check();
    expect(again.defects).toEqual([]);
    expect(again.contractSha).toBe(h.info.contractSha);
  },
  TEST_TIMEOUT,
);

test(
  "CHECK reads CRLF as LF for the contract hash and reports an open brief finding",
  () => {
    const s = new Scenario({ id: "C-0202-crlf", checks: [automated("CK1")] });
    const rel = `.grace5/changes/${s.id}/contract.xml`;
    const lf = s.read(rel);
    const first = s.takeHashes();
    expect(first.contractSha).toBe(sha256(lf));
    s.write(rel, lf.replace(/\n/g, "\r\n"));
    expect(s.check().contractSha).toBe(first.contractSha);
    s.write(rel, lf);

    s.writeBrief({ openFinding: true });
    const open = s.check();
    expect(open.code).toBe(1);
    expect(open.defects.some((d) => d.startsWith("brief-1.html: "))).toBe(true);
  },
  TEST_TIMEOUT,
);

test(
  "RUN every form is refused before a start run, and a second start run is refused",
  () => {
    const s = prepared({ id: "C-0203-start", checks: [automated("CK1"), manual("MK1")] });
    const forms: string[][] = [
      [],
      ["--check", "CK1"],
      ["--skip", "CK1", "--note", "not today"],
      ["--check", "MK1", "--observe", "passed", "--by", "Ada Bench", "--build", "b1", "--environment", "bench", "--note", "seen"],
    ];
    for (const flags of forms) {
      const r = s.run(...flags);
      expect(r.code).toBe(1);
      expect(hasLine(r, "refused: no start run")).toBe(true);
    }
    // A refused invocation writes no receipt.
    expect(s.runNumbers()).toEqual([]);
    expect(hasLine(s.status(), "next: no start run")).toBe(true);

    expect(s.start().code).toBe(0);
    const second = s.start();
    expect(second.code).toBe(1);
    expect(hasLine(second, /^refused: .+$/)).toBe(true);
    expect(s.runNumbers()).toEqual([1]);
    expect(attr(s.receipt(1), "Run", "start")).toBe("true");
  },
  TEST_TIMEOUT,
);

test(
  "AUTH an approval that does not authorize execution runs nothing until the Execution statement is recorded",
  () => {
    const s = new Scenario({ id: "C-0204-execution", checks: [automated("CK1")] });
    s.takeHashes();
    s.writeBrief();
    s.writeApproval({ executes: false });
    s.commit("approved, not yet for execution");

    expect(hasLine(s.status(), "authorization: approved")).toBe(true);
    const refused = s.start();
    expect(refused.code).toBe(1);
    expect(hasLine(refused, "refused: approval does not authorize execution")).toBe(true);
    expect(s.runNumbers()).toEqual([]);
    const close = s.close();
    expect(close.code).toBe(1);
    expect(hasLine(close, "refused: approval does not authorize execution")).toBe(true);

    s.writeApproval({ executes: false, execution: true });
    expect(s.check().defects).toEqual([]);
    expect(hasLine(s.status(), "authorization: approved for execution")).toBe(true);
    const start = s.start();
    expect(start.code).toBe(0);
    expect(hasLine(start, "run 1: CK1 passed")).toBe(true);
  },
  TEST_TIMEOUT,
);

test(
  "CLOSE review obligations: no review, incomplete review, missing adequacy, a check that does not discriminate",
  () => {
    const s = prepared({ id: "C-0205-review", checks: [automated("CK1")] });
    expect(s.start().code).toBe(0);
    expect(s.run().code).toBe(0);

    const refusal = (phrase: string) => {
      const close = s.close();
      expect(close.code).toBe(1);
      expect(hasLine(close, `refused: ${phrase}`)).toBe(true);
      expect(s.hasRecord("close.xml")).toBe(false);
    };
    refusal("no review");
    expect(hasLine(s.status(), "next: no review")).toBe(true);
    s.writeReview({ status: "incomplete" });
    refusal("review is incomplete");
    s.writeReview({ omitAdequacy: ["CK1"] });
    refusal("no adequacy statement for check CK1");
    s.writeReview({ notDiscriminating: ["CK1"] });
    refusal("check CK1 does not discriminate");
    // A blocking finding the owner disposed of, and a non-blocking open one, do not hold the change.
    s.writeReview({
      findings: [
        { id: "F1", severity: "blocking", status: "owner-disposed" },
        { id: "F2", severity: "non-blocking", status: "open" },
      ],
    });
    const close = s.close();
    expect(close.code).toBe(0);
    expect(attr(s.record("close.xml"), "Close", "review")).toBe("4");
  },
  TEST_TIMEOUT,
);

test(
  "TRACE min and max bound how often a marker occurs before the next one",
  () => {
    const s = prepared({
      id: "C-0206-counts",
      checks: [
        automated("CK1"),
        trace("TMAX", "bun tools/emit.js repeat.log", "any", { expect: [{ marker: "MARK-A", max: 1 }, "MARK-B"] }),
        trace("TMIN2", "bun tools/emit.js repeat.log", "any", { expect: [{ marker: "MARK-A", min: 2 }, "MARK-B"] }),
        trace("TMIN3", "bun tools/emit.js repeat.log", "any", { expect: [{ marker: "MARK-A", min: 3 }, "MARK-B"] }),
      ],
    });
    expect(s.start().code).toBe(0);
    const run = s.run();
    expect(run.code).toBe(1);
    const receipt = s.receipt(2);
    // The log has MARK-A twice before MARK-B.
    expect(resultAttr(receipt, "TMAX", "verdict")).toBe("failed");
    expect(resultAttr(receipt, "TMIN2", "verdict")).toBe("passed");
    expect(resultAttr(receipt, "TMIN3", "verdict")).toBe("failed");
    expect(resultAttr(receipt, "TMAX", "definition-sha256")).toBe(sha256(canonicalDefinition(s.def, "TMAX")));
    expect(canonicalDefinition(s.def, "TMAX")).toContain("expect=1,1|MARK-A\n");
    expect(canonicalDefinition(s.def, "TMIN2")).toContain("expect=2,|MARK-A\n");
    expect(resultAttr(receipt, "TMIN2", "definition-sha256")).toBe(sha256(canonicalDefinition(s.def, "TMIN2")));
  },
  TEST_TIMEOUT,
);

test(
  "CLI an unknown command is a usage error and exits 2",
  () => {
    const s = new Scenario({ id: "C-0207-usage", checks: [automated("CK1")] });
    expect(s.cli(["frobnicate"]).code).toBe(2);
  },
  TEST_TIMEOUT,
);
