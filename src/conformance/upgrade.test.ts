// Conformance cases UP-01 .. UP-11 of models/architecture/conformance.md: the version pin, the refusals and grace5 upgrade.
// UP-06 and UP-08 also drive the chain runner with injected steps, because the kernel's own steps cannot be made to
// fail at the second link or to alter a contract from outside.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { applyUpgrade } from "../upgrade/chain";
import { STEPS, type Step } from "../upgrade/steps";
import { HEX64, PIN_PATH, REPO_ROOT, TEST_TIMEOUT, automated, contractXml, disposeAll, hasLine, kernelVersion, prepared, type CliResult, type ContractDef, type Scenario } from "./helper";

afterAll(() => disposeAll());

const VERSION = kernelVersion();
const IGNORE_LINE = ".grace5/changes/closed/*/records/logs/";
const PACKAGED_SKILLS = path.join(REPO_ROOT, "packages", "skills");

const behind = (pin: string): string => `refused: repository state is at ${pin}, kernel is ${VERSION}: run grace5 upgrade`;
const ahead = (pin: string): string => `refused: repository state is at ${pin}, kernel is ${VERSION}: kernel too old`;
const closedPath = (id: string): string => `.grace5/changes/closed/${id}`;

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
function closeSecond(s: Scenario, def: ContractDef): void {
  s.writeContract(def);
  s.prepare();
  closeFully(s);
}

/** A repository as the 0.1.0 kernel left it: the closed change a sibling under .grace5/changes/, no pin, no ignore line. */
function asVersion010(s: Scenario): void {
  fs.renameSync(s.closedChangeDir, s.openChangeDir);
  s.pin(undefined);
  fs.rmSync(path.join(s.repo, ".gitignore"), { force: true });
}

/** The versions a plan or an applied chain walks through, read from its step and bump lines; must start at `from` and end at the kernel's version. */
function versionsOf(result: CliResult): string[] {
  const versions: string[] = [];
  for (const line of result.lines) {
    const m = /^(step|bump): (\d+\.\d+\.\d+) -> (\d+\.\d+\.\d+): .+$/.exec(line);
    if (!m) continue;
    if (versions.length === 0) versions.push(m[2] ?? "");
    expect(versions.at(-1)).toBe(m[2]);
    versions.push(m[3] ?? "");
  }
  return versions;
}

function readSkill(rel: string): string {
  return fs.readFileSync(path.join(PACKAGED_SKILLS, rel), "utf8");
}

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
    expect(hasLine(listing, new RegExp(`^${s.id}: approved for execution, next: .+$`))).toBe(true);
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
  "UP-02 upgrade refuses while any change is open, naming the ids, and refuses outside a git repository; nothing is written",
  () => {
    const s = prepared({ id: "C-0503-open", checks: [automated("CK1")] });
    const second = "C-0504-also-open";
    s.write(`.grace5/changes/${second}/contract.xml`, contractXml({ id: second, checks: [automated("CK1")] }));
    s.pin("0.1.0");
    s.commit("two open changes at an earlier version");
    const clean = s.porcelain();

    for (const args of [["upgrade"], ["upgrade", "--plan"]]) {
      const refused = s.cli(args);
      expect(refused.code).toBe(1);
      expect(hasLine(refused, `refused: open changes: ${s.id}, ${second}`)).toBe(true);
      expect(refused.out).not.toContain("step:");
      expect(refused.out).not.toContain("pinned:");
    }
    expect(s.readPin()).toBe("0.1.0\n");
    expect(s.porcelain()).toBe(clean);

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
  },
  TEST_TIMEOUT,
);

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
    const versions = versionsOf(plan);
    expect(versions[0]).toBe("0.1.0");
    expect(versions.at(-1)).toBe(VERSION);
    expect(plan.out).not.toContain("pinned:");
    expect(plan.out).not.toContain("upgraded:");

    expect(s.porcelain()).toBe(before);
    expect(s.readPin()).toBeUndefined();
    expect(fs.existsSync(s.openChangeDir)).toBe(true);
    expect(fs.existsSync(s.closedChangeDir)).toBe(false);
    expect(s.exists(".gitignore")).toBe(false);
  },
  TEST_TIMEOUT,
);

test(
  "UP-04 upgrade on a repository without a pin runs the chain from 0.1.0: closed siblings move under closed/ with their logs, the ignore line is appended, the pin is written after each step",
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
    expect(s.read(".gitignore")).toBe(`${IGNORE_LINE}\n`);
    expect(s.readPin()).toBe(`${VERSION}\n`);

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
    // Already in the 0.2.0 shape, as this repository was at v0.2.0: moved, the ignore line present, no pin.
    s.write(".gitignore", `node_modules/\n${IGNORE_LINE}\n`);
    s.pin(undefined);
    s.commit("the 0.2.0 shape without a pin");

    const first = s.cli(["upgrade"]);
    expect(first.code).toBe(0);
    expect(first.lines.at(-1)).toBe(`upgraded: 0.1.0 -> ${VERSION}`);
    expect(s.read(".gitignore")).toBe(`node_modules/\n${IGNORE_LINE}\n`);
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

    // Each step applied twice to state in its shape changes nothing.
    for (const step of STEPS) {
      step.apply(s.repo);
      step.verify(s.repo);
      const once = s.porcelain();
      step.apply(s.repo);
      step.verify(s.repo);
      expect(s.porcelain()).toBe(once);
    }
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
    const bad: Step = {
      from: "0.2.0",
      to: VERSION,
      describe: "fail on purpose",
      apply() {
        throw new Error("the fixture step fails");
      },
      verify() {},
    };
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
  "UP-07 every step refreshes the grace5-* skill directories that exist under .agents/skills/ or .claude/skills/ from the packaged skills, and creates no new location",
  () => {
    const s = prepared({ id: "C-0510-skills", checks: [automated("CK1")] });
    closeFully(s);
    asVersion010(s);
    s.write(".claude/skills/grace5-execute/SKILL.md", "old text of the execute skill\n");
    s.write(".claude/skills/grace5-execute/stale.md", "a file the package does not carry\n");
    s.write(".claude/skills/grace5-mine/SKILL.md", "a skill of this repository, not the kernel's\n");
    s.write(".agents/skills/grace5-prepare/SKILL.md", "old text of the prepare skill\n");
    s.write(".agents/skills/other-skill/SKILL.md", "unrelated\n");

    const upgrade = s.cli(["upgrade"]);
    expect(upgrade.code).toBe(0);
    expect(hasLine(upgrade, "refreshed: .claude/skills/grace5-execute")).toBe(true);
    expect(hasLine(upgrade, "refreshed: .agents/skills/grace5-prepare")).toBe(true);
    expect(upgrade.out).not.toContain("skills: none installed");
    expect(upgrade.lines.filter((l) => l.startsWith("refreshed:")).length).toBe(2 * versionsOf(upgrade).filter((_, i) => i > 0).length);

    expect(s.read(".claude/skills/grace5-execute/SKILL.md")).toBe(readSkill("grace5-execute/SKILL.md"));
    expect(s.read(".agents/skills/grace5-prepare/SKILL.md")).toBe(readSkill("grace5-prepare/SKILL.md"));
    expect(s.exists(".claude/skills/grace5-execute/stale.md")).toBe(false);
    expect(s.read(".claude/skills/grace5-mine/SKILL.md")).toBe("a skill of this repository, not the kernel's\n");
    expect(s.read(".agents/skills/other-skill/SKILL.md")).toBe("unrelated\n");
    // No new location: the skills missing from a location are not installed there, and no other directory appears.
    expect(s.exists(".claude/skills/grace5-prepare")).toBe(false);
    expect(s.exists(".claude/skills/grace5-review")).toBe(false);
    expect(s.exists(".agents/skills/grace5-execute")).toBe(false);
    expect(s.exists(".agents/skills/grace5-review")).toBe(false);
    expect(s.exists("skills")).toBe(false);
    expect(s.exists("packages")).toBe(false);
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
    const rewrite: Step = {
      from: "0.1.0",
      to: VERSION,
      describe: "rewrite the contract on purpose",
      apply(root) {
        const file = path.join(root, closedPath(s.id), "contract.xml");
        fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("Conformance fixture change", "Another title"));
      },
      verify() {},
    };
    let lines: string[] = [];
    expect(await applyUpgrade({ root: s.repo, version: VERSION, steps: [rewrite], plan: false, print: (line) => lines.push(line) })).toBe(1);
    expect(lines).toContain(`failed: post-upgrade check: ${s.id}: contract hash changed`);
    expect(lines.some((l) => l.startsWith("upgraded:"))).toBe(false);
    s.git("checkout", "--", path.relative(s.repo, contractPath).split(path.sep).join("/"));

    // A step that removes a close record: the change reads with a defect it did not have.
    s.pin("0.1.0");
    const remove: Step = {
      from: "0.1.0",
      to: VERSION,
      describe: "remove a close record on purpose",
      apply(root) {
        fs.rmSync(path.join(root, closedPath(s.id), "records", "close.xml"));
      },
      verify() {},
    };
    lines = [];
    expect(await applyUpgrade({ root: s.repo, version: VERSION, steps: [remove], plan: false, print: (line) => lines.push(line) })).toBe(1);
    expect(lines.some((l) => new RegExp(`^failed: post-upgrade check: ${s.id}: .*close\\.xml.*$`).test(l))).toBe(true);

    // A step that changes nothing passes the check.
    s.git("checkout", "--", ".grace5");
    s.pin("0.1.0");
    const harmless: Step = { from: "0.1.0", to: VERSION, describe: "do nothing", apply() {}, verify() {} };
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
  "UP-09 init writes the pin with the kernel's version when it creates .grace5/, reports it as existing afterwards, and is refused on a stale pin",
  () => {
    const s = prepared({ id: "C-0512-init", checks: [automated("CK1")] });
    fs.rmSync(path.join(s.repo, ".grace5"), { recursive: true });
    expect(s.cli(["status"]).lines[0]).toBe(`kernel: ${VERSION}, state: none`);

    const created = s.cli(["init"]);
    expect(created.code).toBe(0);
    expect(hasLine(created, `created: ${PIN_PATH}`)).toBe(true);
    expect(s.readPin()).toBe(`${VERSION}\n`);
    expect(s.read(".grace5/README.md")).toContain("kernel-version");
    expect(s.cli(["status"]).lines[0]).toBe(`kernel: ${VERSION}, state: ${VERSION}`);

    const again = s.cli(["init", "C-0513-second"]);
    expect(again.code).toBe(0);
    expect(hasLine(again, `exists: ${PIN_PATH}`)).toBe(true);
    expect(hasLine(again, "created: .grace5/changes/C-0513-second/contract.xml")).toBe(true);
    expect(s.readPin()).toBe(`${VERSION}\n`);

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
