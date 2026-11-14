// Conformance cases UP-01, UP-02, UP-09, UP-10, UP-11, UP-16, UP-17 and UP-18 of models/architecture/conformance.md:
// the version pin, its refusals behind, ahead and unreadable, init, and the kernel a result was recorded with.
// Split mechanically from upgrade.test.ts by C-0010; the tests are unchanged.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { LOCAL_IGNORE_PATH, LOCAL_IGNORE_TEXT, PIN_PATH, TEST_TIMEOUT, UPGRADE_VERSION, ahead, automated, behind, closeFully, disposeAll, hasLine, prepared, unreadable, attr } from "./helper";

const VERSION = UPGRADE_VERSION;

afterAll(() => disposeAll());

test(
  "UP-01 a command other than status, upgrade and the flags refuses a pin behind the kernel with the fixed phrase, and a missing pin reads as 0.1.0",
  () => {
    const s = prepared({ id: "C-0501-behind", checks: [automated("CK1")] });
    s.pin("0.2.0");
    s.commit("pin the state at an earlier version");

    for (const args of [["check", s.id], ["run", s.id, "--start"], ["close", s.id], ["init", "C-0502-new"], ["init"]]) {
      const refused = s.cli(args);
      expect(refused.code).toBe(1);
      expect(hasLine(refused, behind("0.2.0"))).toBe(true);
      expect(refused.out).not.toContain("created:");
    }
    expect(s.runNumbers()).toEqual([]);
    expect(s.exists(".grace5/changes/C-0502-new")).toBe(false);

    // status answers in both forms and names the command to run; the flags are never refused.
    const status = s.status();
    expect(status.code).toBe(0);
    expect(status.lines[0]).toBe(`kernel: ${VERSION}, state: 0.2.0, run grace5 upgrade`);
    expect(hasLine(status, `change: ${s.id}`)).toBe(true);
    const listing = s.cli(["status"]);
    expect(listing.code).toBe(0);
    expect(listing.lines[0]).toBe(`kernel: ${VERSION}, state: 0.2.0, run grace5 upgrade`);
    expect(hasLine(listing, new RegExp(`^${s.id}: approved, next: .+$`))).toBe(true);
    expect(s.cli(["--version"]).code).toBe(0);
    expect(s.cli(["--help"]).code).toBe(0);
    expect(s.cli(["check", "--help"]).code).toBe(0);

    // Where .grace5/ exists without a pin, the state is at 0.1.0.
    s.pin(undefined);
    const unpinned = s.check();
    expect(unpinned.code).toBe(1);
    expect(hasLine(unpinned, behind("0.1.0"))).toBe(true);
    expect(s.cli(["status"]).lines[0]).toBe(`kernel: ${VERSION}, state: 0.1.0, run grace5 upgrade`);

    // Pinned to the kernel again, the commands run.
    s.pin(VERSION);
    expect(s.check().code).toBe(0);
    expect(s.start().code).toBe(0);
  },
  TEST_TIMEOUT,
);

test(
  "UP-02 upgrade refuses outside a git repository, and a change id or --all on it is a usage error; nothing is written",
  () => {
    const s = prepared({ id: "C-0503-open", checks: [automated("CK1")] });
    s.pin("0.1.0");
    s.commit("an open change at an earlier version");
    const clean = s.porcelain();

    // Outside a git repository.
    const plain = path.join(s.scratch, "plain");
    fs.mkdirSync(path.join(plain, ".grace5", "changes"), { recursive: true });
    const outside = s.cli(["--root", plain, "upgrade"]);
    expect(outside.code).toBe(1);
    expect(hasLine(outside, "refused: not a git repository")).toBe(true);
    expect(fs.existsSync(path.join(plain, PIN_PATH))).toBe(false);

    // upgrade takes no change id and no --all.
    expect(s.cli(["upgrade", s.id]).code).toBe(2);
    expect(s.cli(["upgrade", "--all"]).code).toBe(2);
    expect(s.readPin()).toBe("0.1.0\n");
    expect(s.porcelain()).toBe(clean);
  },
  TEST_TIMEOUT,
);

test(
  "UP-09 init writes the pin with the kernel's version and the local ignore file when it creates .grace5/, reports them as existing afterwards, and is refused on a stale pin",
  () => {
    const s = prepared({ id: "C-0512-init", checks: [automated("CK1")] });
    fs.rmSync(path.join(s.repo, ".grace5"), { recursive: true });
    expect(s.cli(["status"]).lines[0]).toBe(`kernel: ${VERSION}, state: none`);
    expect(s.exists(".gitignore")).toBe(false);

    const created = s.cli(["init"]);
    expect(created.code).toBe(0);
    expect(hasLine(created, `created: ${PIN_PATH}`)).toBe(true);
    expect(hasLine(created, `created: ${LOCAL_IGNORE_PATH}`)).toBe(true);
    expect(s.readPin()).toBe(`${VERSION}\n`);
    expect(s.read(LOCAL_IGNORE_PATH)).toBe(LOCAL_IGNORE_TEXT);
    // No project file: init writes under .grace5/ only.
    expect(s.exists(".gitignore")).toBe(false);
    expect(s.read(".grace5/README.md")).toContain("kernel-version");
    expect(s.cli(["status"]).lines[0]).toBe(`kernel: ${VERSION}, state: ${VERSION}`);

    const again = s.cli(["init", "C-0513-second"]);
    expect(again.code).toBe(0);
    expect(hasLine(again, `exists: ${PIN_PATH}`)).toBe(true);
    expect(hasLine(again, `exists: ${LOCAL_IGNORE_PATH}`)).toBe(true);
    expect(hasLine(again, "created: .grace5/changes/C-0513-second/contract.xml")).toBe(true);
    expect(s.readPin()).toBe(`${VERSION}\n`);
    expect(s.read(LOCAL_IGNORE_PATH)).toBe(LOCAL_IGNORE_TEXT);

    s.pin("0.2.0");
    const refused = s.cli(["init", "C-0514-third"]);
    expect(refused.code).toBe(1);
    expect(hasLine(refused, behind("0.2.0"))).toBe(true);
    expect(s.exists(".grace5/changes/C-0514-third")).toBe(false);
    expect(s.readPin()).toBe("0.2.0\n");
  },
  TEST_TIMEOUT,
);

test(
  "UP-10 a pin ahead of the kernel is refused with kernel too old by every command including upgrade, and status reports it",
  () => {
    const s = prepared({ id: "C-0515-ahead", checks: [automated("CK1")] });
    closeFully(s);
    s.pin("99.0.0");
    s.commit("a state from a later kernel");
    const clean = s.porcelain();

    for (const args of [["check", s.id], ["run", s.id], ["close", s.id], ["init", "C-0516-new"], ["upgrade"], ["upgrade", "--plan"]]) {
      const refused = s.cli(args);
      expect(refused.code).toBe(1);
      expect(hasLine(refused, ahead("99.0.0"))).toBe(true);
    }
    expect(s.porcelain()).toBe(clean);
    expect(s.readPin()).toBe("99.0.0\n");
    expect(s.cli(["status"]).lines[0]).toBe(`kernel: ${VERSION}, state: 99.0.0, kernel too old`);
    expect(s.status().lines[0]).toBe(`kernel: ${VERSION}, state: 99.0.0, kernel too old`);
  },
  TEST_TIMEOUT,
);

test(
  "UP-11 a pin equal to the kernel's version lets every command run, and upgrade says up to date",
  () => {
    const s = prepared({ id: "C-0517-equal", checks: [automated("CK1")] });
    expect(s.readPin()).toBe(`${VERSION}\n`);
    expect(s.check().code).toBe(0);
    expect(s.status().lines[0]).toBe(`kernel: ${VERSION}, state: ${VERSION}`);
    closeFully(s);
    s.commit("close the change");
    const clean = s.porcelain();

    const upgrade = s.cli(["upgrade"]);
    expect(upgrade.code).toBe(0);
    expect(upgrade.lines).toEqual([`up to date: ${VERSION}`]);
    expect(s.porcelain()).toBe(clean);
    expect(s.cli(["init", "C-0518-next"]).code).toBe(0);
  },
  TEST_TIMEOUT,
);

test(
  "UP-16 an unreadable pin is refused by every command but status with the fixed phrase, and status reports state: unreadable",
  () => {
    const s = prepared({ id: "C-0525-unreadable", checks: [automated("CK1")] });
    s.write(PIN_PATH, "banana\n");
    s.commit("a pin that is not a version");
    const clean = s.porcelain();

    for (const args of [["check", s.id], ["run", s.id, "--start"], ["close", s.id], ["init", "C-0526-new"], ["init"], ["upgrade"], ["upgrade", "--plan"]]) {
      const refused = s.cli(args);
      expect(refused.code).toBe(1);
      expect(hasLine(refused, unreadable("banana"))).toBe(true);
      expect(refused.stderr).toContain("refused: repository pin is unreadable");
      expect(refused.out).not.toContain("grace5:");
      expect(refused.out).not.toContain("created:");
      expect(refused.out).not.toContain("step:");
    }
    expect(s.runNumbers()).toEqual([]);
    expect(s.exists(".grace5/changes/C-0526-new")).toBe(false);
    expect(s.porcelain()).toBe(clean);

    const reason = `${PIN_PATH} is not a version: banana`;
    const status = s.status();
    expect(status.code).toBe(0);
    expect(status.lines[0]).toBe(`kernel: ${VERSION}, state: unreadable (${reason})`);
    expect(hasLine(status, `change: ${s.id}`)).toBe(true);
    const listing = s.cli(["status"]);
    expect(listing.code).toBe(0);
    expect(listing.lines[0]).toBe(`kernel: ${VERSION}, state: unreadable (${reason})`);
    expect(s.cli(["--version"]).code).toBe(0);
    expect(s.cli(["upgrade", "--help"]).code).toBe(0);

    s.write(PIN_PATH, "\n");
    const empty = s.check();
    expect(empty.code).toBe(1);
    expect(hasLine(empty, unreadable("empty"))).toBe(true);
    expect(s.cli(["status"]).lines[0]).toBe(`kernel: ${VERSION}, state: unreadable (${PIN_PATH} is not a version: empty)`);

    s.pin(VERSION);
    expect(s.check().code).toBe(0);
  },
  TEST_TIMEOUT,
);

test(
  "UP-17 status names the kernel a counted result was recorded with when it differs from the running one",
  () => {
    const s = prepared({ id: "C-0527-spans-versions", checks: [automated("CK1"), automated("CK2")] });
    expect(s.start().code).toBe(0);
    const plain = s.status();
    expect(hasLine(plain, "check CK1: passed, counts")).toBe(true);
    expect(plain.out).not.toContain("recorded with");

    // The receipt of a run made by the previous kernel, as a change that spans an upgrade carries it.
    const file = path.join(s.recordsDir, `run-${String(s.latestRun())}.xml`);
    const text = fs.readFileSync(file, "utf8");
    expect(text).toContain(`kernel="grace5 ${VERSION}"`);
    fs.writeFileSync(file, text.replace(`kernel="grace5 ${VERSION}"`, `kernel="grace5 0.3.0"`));
    const status = s.status();
    expect(status.code).toBe(0);
    expect(hasLine(status, "check CK1: passed, counts, recorded with grace5 0.3.0")).toBe(true);
    expect(hasLine(status, "check CK2: passed, counts, recorded with grace5 0.3.0")).toBe(true);
    expect(status.out).not.toContain("malformed");

    // A result that does not count says so first, then the kernel.
    s.changeProduct("a new candidate");
    const stale = s.status();
    expect(hasLine(stale, "check CK1: passed, does not count: recorded on an earlier candidate, recorded with grace5 0.3.0")).toBe(true);

    // A new result from this kernel carries no suffix; the other check keeps its line.
    expect(s.run("--check", "CK1").code).toBe(0);
    const mixed = s.status();
    expect(hasLine(mixed, "check CK1: passed, counts")).toBe(true);
    expect(hasLine(mixed, "check CK2: passed, does not count: recorded on an earlier candidate, recorded with grace5 0.3.0")).toBe(true);
    expect(mixed.lines.filter((l) => l.startsWith("check CK1:") && l.includes("recorded with")).length).toBe(0);
  },
  TEST_TIMEOUT,
);

test(
  "UP-18 a result recorded by 0.3.0 on a pinned tree, or by 0.4.0 on a tree with .grace5/README.md, is on an earlier candidate under this kernel, while a result this kernel records counts after the pin changes",
  () => {
    const s = prepared({ id: "C-0528-boundary", checks: [automated("CK1")] });
    // The entry point init writes: under 0.4.0 it was source, under this kernel it is kernel-managed.
    s.write(".grace5/README.md", "# .grace5\n");
    s.commit("the state's entry point");
    expect(s.start().code).toBe(0);
    s.commit("the start receipt");
    const current = s.computeCandidate();
    const under030 = s.computeCandidate("HEAD", "0.3.0");
    const under040 = s.computeCandidate("HEAD", "0.4.0");
    expect(under030).not.toBe(current);
    expect(under040).not.toBe(current);
    expect(under040).not.toBe(under030);
    const receipt = s.receipt();
    expect(attr(receipt, "Run", "candidate")).toBe(current);
    expect(hasLine(s.status(), "check CK1: passed, counts")).toBe(true);

    // The same receipt as the 0.3.0 kernel would have written it on this tree, whose rule hashed the pin into the
    // candidate, and as the 0.4.0 kernel would have, whose rule hashed .grace5/README.md in.
    const file = path.join(s.recordsDir, `run-${String(s.latestRun())}.xml`);
    for (const [kernel, underOld] of [["0.3.0", under030], ["0.4.0", under040]] as const) {
      fs.writeFileSync(file, receipt.replace(`candidate="${current}"`, `candidate="${underOld}"`).replace(`kernel="grace5 ${VERSION}"`, `kernel="grace5 ${kernel}"`));
      const stale = s.status();
      expect(hasLine(stale, `candidate: ${current} (clean)`)).toBe(true);
      expect(hasLine(stale, `check CK1: passed, does not count: recorded on an earlier candidate, recorded with grace5 ${kernel}`)).toBe(true);
      expect(hasLine(stale, "next: check CK1: recorded on an earlier candidate")).toBe(true);
      s.writeReview({ candidate: underOld });
      const close = s.close();
      expect(close.code).toBe(1);
      expect(hasLine(close, "refused: check CK1: recorded on an earlier candidate")).toBe(true);
      expect(s.hasRecord("close.xml")).toBe(false);
    }

    // Rerun by this kernel: the result counts, and keeps counting when the pin is rewritten, removed and written back by upgrade.
    expect(s.run("--check", "CK1").code).toBe(0);
    expect(attr(s.receipt(), "Run", "candidate")).toBe(current);
    const counting = "check CK1: passed, counts";
    expect(hasLine(s.status(), counting)).toBe(true);
    s.pin("0.3.0");
    s.commit("the pin rewritten");
    expect(hasLine(s.status(), counting)).toBe(true);
    expect(hasLine(s.cli(["upgrade"]), `upgraded: 0.3.0 -> ${VERSION}`)).toBe(true);
    expect(hasLine(s.status(), counting)).toBe(true);
    expect(hasLine(s.status(), `candidate: ${current} (clean)`)).toBe(true);
    s.commit("the pin advanced");
    expect(hasLine(s.status(), counting)).toBe(true);
  },
  TEST_TIMEOUT,
);
