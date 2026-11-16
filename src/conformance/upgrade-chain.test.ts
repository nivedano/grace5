// Conformance cases UP-03, UP-04, UP-05, UP-06, UP-08 and UP-13 of models/architecture/conformance.md: the upgrade
// chain, its plan, its idempotence, its failing steps and its post-upgrade check. UP-06, UP-08 and UP-13 also drive
// the chain runner with injected steps, because the kernel's own steps cannot be made to fail at the second link, to
// alter a contract from outside, or to write an open change. Split mechanically from upgrade.test.ts by C-0010; the
// tests are unchanged.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { applyUpgrade } from "../upgrade/chain";
import { STEPS } from "../upgrade/steps";
import { HEX64, LOCAL_IGNORE_PATH, LOCAL_IGNORE_STEP, LOCAL_IGNORE_TEXT, OLD_PROJECT_IGNORE_LINE, PIN_PATH, TEST_TIMEOUT, UPGRADE_VERSION, asVersion010, automated, behind, closedPath, closeFully, closeSecond, contractXml, disposeAll, fixtureStep, hasLine, prepared, versionsOf } from "./helper";

const VERSION = UPGRADE_VERSION;

afterAll(() => disposeAll());

test(
  "UP-03 upgrade --plan prints one line per step and pin bump from the pinned version to the kernel's, and writes nothing",
  () => {
    const s = prepared({ id: "C-0505-plan", checks: [automated("CK1")] });
    closeFully(s);
    asVersion010(s);
    const before = s.porcelain();

    const plan = s.cli(["upgrade", "--plan"]);
    expect(plan.code).toBe(0);
    expect(hasLine(plan, /^step: 0\.1\.0 -> 0\.2\.0: .*closed.*$/)).toBe(true);
    expect(hasLine(plan, /^step: 0\.2\.0 -> 0\.3\.0: .*kernel-version.*$/)).toBe(true);
    expect(hasLine(plan, "step: 0.3.0 -> 0.4.0: refresh the installed skills to 0.4.0")).toBe(true);
    expect(hasLine(plan, LOCAL_IGNORE_STEP)).toBe(true);
    expect(hasLine(plan, "step: 0.5.0 -> 0.6.0: install grace5-orchestrate beside the installed skills and refresh them to 0.6.0")).toBe(true);
    const versions = versionsOf(plan);
    expect(versions[0]).toBe("0.1.0");
    expect(versions.at(-1)).toBe(VERSION);
    expect(plan.out).not.toContain("pinned:");
    expect(plan.out).not.toContain("upgraded:");
    expect(plan.out).not.toContain("writes:");

    expect(s.porcelain()).toBe(before);
    expect(s.readPin()).toBeUndefined();
    expect(fs.existsSync(s.openChangeDir)).toBe(true);
    expect(fs.existsSync(s.closedChangeDir)).toBe(false);
    expect(s.exists(".gitignore")).toBe(false);
    expect(s.exists(LOCAL_IGNORE_PATH)).toBe(false);
  },
  TEST_TIMEOUT,
);

test(
  "UP-04 upgrade on a repository without a pin runs the chain from 0.1.0: closed siblings move under closed/ with their logs, the local ignore file is written and no project file, the pin is written after each step",
  () => {
    const s = prepared({ id: "C-0506-sibling", checks: [automated("CK1")] });
    const sibling = s.id;
    closeFully(s);
    s.commit("close the first change");
    const moved = "C-0507-moved";
    closeSecond(s, { id: moved, checks: [automated("CK1")] });
    const movedBefore = s.check(moved);
    expect(HEX64.test(movedBefore.contractSha)).toBe(true);
    // The first change goes back to where a 0.1.0 kernel left it; the second stays under closed/ as a 0.2.0 kernel left it.
    fs.renameSync(path.join(s.repo, closedPath(sibling)), path.join(s.repo, ".grace5", "changes", sibling));
    s.pin(undefined);
    fs.rmSync(path.join(s.repo, ".gitignore"), { force: true });
    fs.rmSync(path.join(s.repo, LOCAL_IGNORE_PATH), { force: true });
    expect(fs.existsSync(path.join(s.repo, ".grace5", "changes", sibling, "records", "logs", "run-2", "CK1.log"))).toBe(true);
    const siblingBefore = s.check(sibling);
    expect(siblingBefore.code).toBe(1);
    expect(hasLine(siblingBefore, behind("0.1.0"))).toBe(true);

    const upgrade = s.cli(["upgrade"]);
    expect(upgrade.code).toBe(0);
    const versions = versionsOf(upgrade);
    expect(versions[0]).toBe("0.1.0");
    expect(versions.at(-1)).toBe(VERSION);
    expect(hasLine(upgrade, "pinned: 0.2.0")).toBe(true);
    expect(hasLine(upgrade, `pinned: ${VERSION}`)).toBe(true);
    expect(upgrade.lines.indexOf("pinned: 0.2.0")).toBeLessThan(upgrade.lines.indexOf(`pinned: ${VERSION}`));
    expect(hasLine(upgrade, "skills: none installed")).toBe(true);
    expect(hasLine(upgrade, `checked: ${sibling}`)).toBe(true);
    expect(hasLine(upgrade, `checked: ${moved}`)).toBe(true);
    expect(upgrade.lines.at(-1)).toBe(`upgraded: 0.1.0 -> ${VERSION}`);

    expect(fs.existsSync(path.join(s.repo, ".grace5", "changes", sibling))).toBe(false);
    expect(fs.existsSync(path.join(s.repo, closedPath(sibling), "records", "close.xml"))).toBe(true);
    expect(fs.existsSync(path.join(s.repo, closedPath(sibling), "records", "logs", "run-2", "CK1.log"))).toBe(true);
    expect(fs.existsSync(path.join(s.repo, closedPath(moved), "records", "close.xml"))).toBe(true);
    // The run-log ignore lines live in the local ignore file; the kernel writes no project file.
    expect(s.read(LOCAL_IGNORE_PATH)).toBe(LOCAL_IGNORE_TEXT);
    expect(s.exists(".gitignore")).toBe(false);
    expect(s.readPin()).toBe(`${VERSION}\n`);
    // Git honours the local file: the untracked logs under the moved change are ignored, so none is listed as new.
    expect(s.porcelain().split("\n").filter((l) => l.startsWith("??") && l.includes("records/logs/"))).toEqual([]);

    const listing = s.cli(["status", "--all"]);
    expect(listing.lines[0]).toBe(`kernel: ${VERSION}, state: ${VERSION}`);
    expect(hasLine(listing, `${sibling}: closed`)).toBe(true);
    expect(hasLine(listing, `${moved}: closed`)).toBe(true);
    expect(listing.lines.at(-1)).toBe("closed changes: 2");
    const siblingAfter = s.check(sibling);
    expect(siblingAfter.code).toBe(0);
    expect(HEX64.test(siblingAfter.contractSha)).toBe(true);
    expect(siblingAfter.defects).toEqual([]);
    expect(s.check(moved).contractSha).toBe(movedBefore.contractSha);
  },
  TEST_TIMEOUT,
);

test(
  "UP-05 upgrade is idempotent: a repository already in shape upgrades without moving or appending anything, and an upgraded one is up to date",
  () => {
    const s = prepared({ id: "C-0508-inshape", checks: [automated("CK1")] });
    closeFully(s);
    const before = s.check();
    expect(HEX64.test(before.contractSha)).toBe(true);
    // Already in shape: moved, the local ignore file present, the line an earlier kernel wrote into the project's
    // .gitignore still there, no pin. The project file is left byte for byte as it is.
    s.write(".gitignore", `node_modules/\n${OLD_PROJECT_IGNORE_LINE}\n`);
    s.write(LOCAL_IGNORE_PATH, LOCAL_IGNORE_TEXT);
    s.pin(undefined);
    s.commit("the 0.2.0 shape without a pin");

    const first = s.cli(["upgrade"]);
    expect(first.code).toBe(0);
    expect(first.lines.at(-1)).toBe(`upgraded: 0.1.0 -> ${VERSION}`);
    expect(s.read(".gitignore")).toBe(`node_modules/\n${OLD_PROJECT_IGNORE_LINE}\n`);
    expect(s.read(LOCAL_IGNORE_PATH)).toBe(LOCAL_IGNORE_TEXT);
    expect(fs.existsSync(s.closedChangeDir)).toBe(true);
    expect(s.readPin()).toBe(`${VERSION}\n`);
    expect(s.porcelain()).toBe(`?? ${PIN_PATH}\n`);
    expect(s.check().contractSha).toBe(before.contractSha);

    s.commit("take the upgrade");
    const clean = s.porcelain();
    const second = s.cli(["upgrade"]);
    expect(second.code).toBe(0);
    expect(second.lines).toEqual([`up to date: ${VERSION}`]);
    expect(s.porcelain()).toBe(clean);

    // Each step applied twice to state in its shape changes nothing; the pin step sets the pin to its own `to`, which is
    // behind the kernel's version, so the pin is the one path that may differ afterwards.
    for (const step of STEPS) {
      step.apply(s.repo);
      step.verify(s.repo);
      const once = s.porcelain();
      step.apply(s.repo);
      step.verify(s.repo);
      expect(s.porcelain()).toBe(once);
    }
    expect(s.porcelain().split("\n").filter((l) => l !== "" && !l.endsWith(PIN_PATH))).toEqual([]);
    s.pin(VERSION);
    expect(s.porcelain()).toBe(clean);
  },
  TEST_TIMEOUT,
);

test(
  "UP-06 a failing step stops the upgrade with failed: <from> -> <to>: <reason>, the pin at the last completed version, and a rerun resumes there",
  async () => {
    const s = prepared({ id: "C-0509-duplicate", checks: [automated("CK1")] });
    closeFully(s);
    s.commit("close the change");
    // The 0.1.0 shape with a copy left under closed/: the move cannot happen.
    fs.cpSync(s.closedChangeDir, s.openChangeDir, { recursive: true });
    s.pin(undefined);
    fs.rmSync(path.join(s.repo, ".gitignore"), { force: true });

    const failed = s.cli(["upgrade"]);
    expect(failed.code).toBe(1);
    expect(hasLine(failed, new RegExp(`^failed: 0\\.1\\.0 -> 0\\.2\\.0: .*${s.id}.*$`))).toBe(true);
    expect(failed.out).not.toContain("pinned:");
    expect(failed.out).not.toContain("upgraded:");
    expect(s.readPin()).toBeUndefined();
    expect(s.cli(["status"]).lines[0]).toBe(`kernel: ${VERSION}, state: 0.1.0, run grace5 upgrade`);

    // Fixed, the upgrade runs through.
    fs.rmSync(s.closedChangeDir, { recursive: true });
    const fixed = s.cli(["upgrade"]);
    expect(fixed.code).toBe(0);
    expect(fixed.lines.at(-1)).toBe(`upgraded: 0.1.0 -> ${VERSION}`);
    expect(fs.existsSync(s.closedChangeDir)).toBe(true);

    // With an injected chain whose second step fails, the pin stays at the first step's version and a rerun starts there.
    s.pin("0.1.0");
    const lines: string[] = [];
    const bad = fixtureStep({
      from: "0.2.0",
      to: VERSION,
      describe: "fail on purpose",
      apply() {
        throw new Error("the fixture step fails");
      },
      verify() {},
    });
    const first = STEPS[0];
    if (first === undefined) throw new Error("the kernel has no steps");
    const code = await applyUpgrade({ root: s.repo, version: VERSION, steps: [first, bad], plan: false, print: (line) => lines.push(line) });
    expect(code).toBe(1);
    expect(lines).toContain("pinned: 0.2.0");
    expect(lines).toContain(`failed: 0.2.0 -> ${VERSION}: the fixture step fails`);
    expect(lines.some((l) => l.startsWith("upgraded:"))).toBe(false);
    expect(s.readPin()).toBe("0.2.0\n");
    const resumed = s.cli(["upgrade", "--plan"]);
    expect(resumed.code).toBe(0);
    expect(versionsOf(resumed)[0]).toBe("0.2.0");
    expect(resumed.out).not.toContain("0.1.0 -> 0.2.0");
  },
  TEST_TIMEOUT,
);

test(
  "UP-08 the post-upgrade check fails the upgrade when a change reads with another hash or a new defect",
  async () => {
    const s = prepared({ id: "C-0511-postcheck", checks: [automated("CK1")] });
    closeFully(s);
    s.commit("close the change");
    const before = s.check();
    expect(HEX64.test(before.contractSha)).toBe(true);
    const contractPath = path.join(s.closedChangeDir, "contract.xml");

    // A step that rewrites a contract.
    s.pin("0.1.0");
    const rewrite = fixtureStep({
      from: "0.1.0",
      to: VERSION,
      describe: "rewrite the contract on purpose",
      apply(root) {
        const file = path.join(root, closedPath(s.id), "contract.xml");
        fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("Conformance fixture change", "Another title"));
      },
      verify() {},
    });
    let lines: string[] = [];
    expect(await applyUpgrade({ root: s.repo, version: VERSION, steps: [rewrite], plan: false, print: (line) => lines.push(line) })).toBe(1);
    expect(lines).toContain(`failed: post-upgrade check: ${s.id}: contract hash changed`);
    expect(lines.some((l) => l.startsWith("upgraded:"))).toBe(false);
    s.git("checkout", "--", path.relative(s.repo, contractPath).split(path.sep).join("/"));

    // A step that removes a close record: the change reads with a defect it did not have.
    s.pin("0.1.0");
    const remove = fixtureStep({
      from: "0.1.0",
      to: VERSION,
      describe: "remove a close record on purpose",
      apply(root) {
        fs.rmSync(path.join(root, closedPath(s.id), "records", "close.xml"));
      },
      verify() {},
    });
    lines = [];
    expect(await applyUpgrade({ root: s.repo, version: VERSION, steps: [remove], plan: false, print: (line) => lines.push(line) })).toBe(1);
    expect(lines.some((l) => new RegExp(`^failed: post-upgrade check: ${s.id}: .*close\\.xml.*$`).test(l))).toBe(true);

    // A step that changes nothing passes the check.
    s.git("checkout", "--", ".grace5");
    s.pin("0.1.0");
    const harmless = fixtureStep({ from: "0.1.0", to: VERSION, describe: "do nothing", apply() {}, verify() {} });
    lines = [];
    expect(await applyUpgrade({ root: s.repo, version: VERSION, steps: [harmless], plan: false, print: (line) => lines.push(line) })).toBe(0);
    expect(lines.at(-1)).toBe(`upgraded: 0.1.0 -> ${VERSION}`);

    // The command runs the same check over the kernel's own chain and reports every change it read unchanged.
    s.pin("0.1.0");
    const upgrade = s.cli(["upgrade"]);
    expect(upgrade.code).toBe(0);
    expect(hasLine(upgrade, `checked: ${s.id}`)).toBe(true);
    expect(upgrade.lines.at(-1)).toBe(`upgraded: 0.1.0 -> ${VERSION}`);
    expect(s.check().contractSha).toBe(before.contractSha);
  },
  TEST_TIMEOUT,
);

test(
  "UP-13 upgrade refuses, with no override, a step that would write an open change, naming the step and the ids; the kernel's own steps declare the closed siblings they move and nothing open",
  async () => {
    const s = prepared({ id: "C-0521-touched", checks: [automated("CK1")] });
    const second = "C-0522-also-touched";
    s.write(`.grace5/changes/${second}/contract.xml`, contractXml({ id: second, checks: [automated("CK1")] }));
    s.write(LOCAL_IGNORE_PATH, LOCAL_IGNORE_TEXT);
    s.pin("0.1.0");
    s.commit("two open changes at an earlier version");
    const clean = s.porcelain();

    const touching = fixtureStep({
      from: "0.1.0",
      to: VERSION,
      describe: "write every open change on purpose",
      touches: () => [second, s.id, "C-0599-not-open"],
      apply() {
        throw new Error("the step must not be applied");
      },
      verify() {},
    });
    for (const plan of [false, true]) {
      const lines: string[] = [];
      const refusals: string[] = [];
      const code = await applyUpgrade({ root: s.repo, version: VERSION, steps: [touching], plan, print: (line) => lines.push(line), refuse: (reason) => refusals.push(reason) });
      expect(code).toBe(1);
      expect(refusals).toEqual([`open changes touched by step 0.1.0 -> ${VERSION}: ${s.id}, ${second}`]);
      expect(lines).toEqual([]);
    }
    expect(s.readPin()).toBe("0.1.0\n");
    expect(s.porcelain()).toBe(clean);

    // The kernel's own steps: the move declares the closed siblings, the pin, skill and local ignore steps nothing; an open change is never declared.
    const historicalSteps = STEPS.filter((step) => ["0.1.0", "0.2.0", "0.3.0", "0.4.0", "0.5.0"].includes(step.from));
    expect(historicalSteps.map((step) => step.touches(s.repo))).toEqual([[], [], [], [], []]);
    s.pin(VERSION);
    closeFully(s);
    s.commit("close the first change");
    fs.renameSync(s.closedChangeDir, s.openChangeDir);
    s.pin(undefined);
    s.commit("the closed change as a sibling, as a 0.1.0 kernel left it");
    expect(historicalSteps.map((step) => step.touches(s.repo))).toEqual([[s.id], [], [], [], []]);

    // So the command proceeds: the sibling moves, the open change is untouched.
    const upgrade = s.cli(["upgrade"]);
    expect(upgrade.code).toBe(0);
    expect(hasLine(upgrade, `open, untouched: ${second}`)).toBe(true);
    expect(upgrade.out).not.toContain("refused:");
    expect(fs.existsSync(path.join(s.repo, closedPath(s.id), "records", "close.xml"))).toBe(true);
    expect(hasLine(upgrade, `checked: ${second}`)).toBe(true);
    expect(upgrade.lines.at(-1)).toBe(`upgraded: 0.1.0 -> ${VERSION}`);
    expect(hasLine(s.cli(["status"]), new RegExp(`^${second}: unapproved, next: .+$`))).toBe(true);
  },
  TEST_TIMEOUT,
);
