// The run and check refusals of commands.md, the trace bounds, the release-free close, the review obligations and
// the usage error. Split mechanically from receipts.test.ts by C-0010; the tests are unchanged.

import { afterAll, expect, test } from "bun:test";
import {
  Scenario,
  TEST_TIMEOUT,
  attr,
  automated,
  canonicalDefinition,
  disposeAll,
  hasLine,
  manual,
  prepared,
  resultAttr,
  sha256,
  trace,
} from "./helper";

afterAll(() => disposeAll());

test(
  "RECEIPT personal attribution is absent from new records, legacy attributes remain readable, and obsolete observation inputs are rejected",
  () => {
    for (const legacy of [false, true]) {
      const s = new Scenario({ id: legacy ? "C-0211-legacy-attribution" : "C-0210-no-attribution", checks: [manual("MK1")] });
      s.write("observation.txt", "observe=passed\nbuild=bench-build-7\nenvironment=bench\nnote=The procedure passed.\n");
      s.write("obsolete-observation.txt", "observe=passed\nby=Private Identity\n");
      s.prepare();
      const records = `.grace5/changes/${s.id}/records/`;
      if (legacy) s.write(`${records}approval-1.xml`, s.record("approval-1.xml").replace("<Approval ", '<Approval owner="Legacy Owner" recorded-by="Legacy Recorder" '));
      expect(s.check().defects).toEqual([]);
      expect(s.start().code).toBe(0);
      const before = s.runNumbers();
      const obsoleteFlag = s.run("--check", "MK1", "--observe", "passed", "--by", "Private Identity");
      expect(obsoleteFlag.code).toBe(2);
      expect(obsoleteFlag.out).not.toContain("Private Identity");
      const obsoleteFile = s.run("--check", "MK1", "--from", `${s.repo}/obsolete-observation.txt`);
      expect(obsoleteFile.code).toBe(2);
      expect(obsoleteFile.out).toContain("unknown field 'by'");
      expect(obsoleteFile.out).not.toContain("Private Identity");
      expect(s.runNumbers()).toEqual(before);
      expect(s.run("--check", "MK1", "--from", `${s.repo}/observation.txt`).code).toBe(0);
      expect(attr(s.receipt(), "Observation", "by")).toBeUndefined();
      s.writeReview();
      if (legacy) {
        s.write(`${records}run-2.xml`, s.receipt(2).replace("<Observation ", '<Observation by="Legacy Observer" '));
        s.write(`${records}review-1.xml`, s.record("review-1.xml").replace("<Review ", '<Review reviewer="Legacy Reviewer" '));
      } else {
        expect(attr(s.record("approval-1.xml"), "Approval", "owner")).toBeUndefined();
        expect(attr(s.record("approval-1.xml"), "Approval", "recorded-by")).toBeUndefined();
        expect(attr(s.record("review-1.xml"), "Review", "reviewer")).toBeUndefined();
      }
      const originals = ["approval-1.xml", "review-1.xml", "run-2.xml"].map((name) => s.record(name));
      expect(s.check().defects).toEqual([]);
      expect(s.close().code).toBe(0);
      expect(["approval-1.xml", "review-1.xml", "run-2.xml"].map((name) => s.record(name))).toEqual(originals);
    }
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
      ["--check", "MK1", "--observe", "passed", "--build", "b1", "--environment", "bench", "--note", "seen"],
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
  "REL a change closes without writing the kernel version or the pin",
  () => {
    const s = new Scenario({ id: "C-0299-release", checks: [automated("CK1")] });
    s.write("package.json", `{\n  "version": "0.0.0-fixture"\n}\n`);
    s.prepare();
    const pkg = s.read("package.json");
    const pin = s.read(".grace5/kernel-version");
    expect(s.start().code).toBe(0);
    expect(s.run().code).toBe(0);
    s.writeReview();
    expect(s.close().code).toBe(0);
    expect(s.read("package.json")).toBe(pkg);
    expect(s.read(".grace5/kernel-version")).toBe(pin);
    expect(s.check().defects).toEqual([]);
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
