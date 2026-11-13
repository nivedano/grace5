// Conformance cases UP-01 .. UP-17 of models/architecture/conformance.md: the version pin, the refusals and grace5 upgrade.
// UP-06, UP-08 and UP-13 also drive the chain runner with injected steps, because the kernel's own steps cannot be made
// to fail at the second link, to alter a contract from outside, or to write an open change.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { applyUpgrade } from "../upgrade/chain";
import { STEPS, type Step } from "../upgrade/steps";
import { HEX64, PIN_PATH, REPO_ROOT, TEST_TIMEOUT, attr, automated, contractXml, disposeAll, hasLine, kernelVersion, prepared, sha256, type CliResult, type ContractDef, type Scenario } from "./helper";

afterAll(() => disposeAll());

const VERSION = kernelVersion();
const IGNORE_LINE = ".grace5/changes/closed/*/records/logs/";
const PACKAGED_SKILLS = path.join(REPO_ROOT, "packages", "skills");

const behind = (pin: string): string => `refused: repository state is at ${pin}, kernel is ${VERSION}: run grace5 upgrade`;
const ahead = (pin: string): string => `refused: repository state is at ${pin}, kernel is ${VERSION}: kernel too old`;
const unreadable = (reason: string): string => `refused: repository pin is unreadable: ${PIN_PATH} is not a version: ${reason}`;
const closedPath = (id: string): string => `.grace5/changes/closed/${id}`;

/** An injected step for the chain runner: one that declares no writes unless the case says otherwise. */
function fixtureStep(step: Omit<Step, "touches" | "writes"> & Partial<Pick<Step, "touches" | "writes">>): Step {
  return { touches: () => [], writes: () => [], ...step };
}

/** The `candidate:` line of `status <id>`. */
function candidateLine(s: Scenario, id = s.id): string {
  const line = s.cli(["status", id]).lines.find((l) => l.startsWith("candidate: "));
  if (line === undefined) throw new Error(`status ${id} printed no candidate line`);
  return line;
}

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

    // Each step applied twice to state in its shape changes nothing; the pin step sets the pin to its own `to`, which is
    // behind a kernel whose chain ends in a bump, so the pin is the one path that may differ afterwards.
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
    // Two directories refreshed once per step; a pin bump refreshes nothing (F3 of review 1 of C-0004-upgrade-command).
    expect(upgrade.lines.filter((l) => l.startsWith("refreshed:")).length).toBe(2 * upgrade.lines.filter((l) => l.startsWith("step:")).length);

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

test(
  "UP-12 upgrade proceeds with open changes present when no step writes their directories or any source path, lists them as open, untouched, and the post-upgrade check covers them",
  () => {
    const s = prepared({ id: "C-0519-closed-beside", checks: [automated("CK1")] });
    closeFully(s);
    s.commit("close the first change");
    const open = "C-0520-open";
    s.write(`.grace5/changes/${open}/contract.xml`, contractXml({ id: open, checks: [automated("CK1")] }));
    // The 0.2.0 shape: the closed change under closed/, the ignore line present, no pin, no skills installed.
    s.write(".gitignore", `${IGNORE_LINE}\n`);
    s.pin(undefined);
    s.commit("an open change beside a closed one, state without a pin");
    const clean = s.porcelain();
    const contractSha = sha256(s.read(`.grace5/changes/${open}/contract.xml`).replace(/\r\n/g, "\n"));
    const before = candidateLine(s, open);
    expect(before).toMatch(/^candidate: [0-9a-f]{64} \(clean\)$/);

    const plan = s.cli(["upgrade", "--plan"]);
    expect(plan.code).toBe(0);
    expect(hasLine(plan, `open, untouched: ${open}`)).toBe(true);
    expect(plan.out).not.toContain("writes:");
    expect(plan.out).not.toContain("refused:");
    expect(s.porcelain()).toBe(clean);
    expect(s.readPin()).toBeUndefined();

    const upgrade = s.cli(["upgrade"]);
    expect(upgrade.code).toBe(0);
    expect(hasLine(upgrade, `open, untouched: ${open}`)).toBe(true);
    expect(upgrade.out).not.toContain("writes:");
    expect(upgrade.out).not.toContain("evidence of open changes");
    expect(upgrade.out).not.toContain("refused:");
    expect(hasLine(upgrade, `checked: ${open}`)).toBe(true);
    expect(hasLine(upgrade, `checked: ${s.id}`)).toBe(true);
    expect(upgrade.lines.at(-1)).toBe(`upgraded: 0.1.0 -> ${VERSION}`);
    expect(s.readPin()).toBe(`${VERSION}\n`);
    // Nothing under the open change was written; the pin is the only new path.
    expect(s.porcelain()).toBe(`?? ${PIN_PATH}\n`);
    expect(fs.existsSync(path.join(s.repo, ".grace5", "changes", open, "records", "close.xml"))).toBe(false);

    const listing = s.cli(["status", "--all"]);
    expect(listing.lines[0]).toBe(`kernel: ${VERSION}, state: ${VERSION}`);
    expect(hasLine(listing, new RegExp(`^${open}: unapproved, next: .+$`))).toBe(true);
    expect(hasLine(listing, `${s.id}: closed`)).toBe(true);
    expect(listing.lines.at(-1)).toBe("closed changes: 1");
    expect(candidateLine(s, open)).toBe(before);
    const check = s.check(open);
    expect(check.code).toBe(0);
    expect(check.contractSha).toBe(contractSha);
  },
  TEST_TIMEOUT,
);

test(
  "UP-13 upgrade refuses, with no override, a step that would write an open change, naming the step and the ids; the kernel's own steps declare the closed siblings they move and nothing open",
  async () => {
    const s = prepared({ id: "C-0521-touched", checks: [automated("CK1")] });
    const second = "C-0522-also-touched";
    s.write(`.grace5/changes/${second}/contract.xml`, contractXml({ id: second, checks: [automated("CK1")] }));
    s.write(".gitignore", `${IGNORE_LINE}\n`);
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
    for (const acceptEvidenceLoss of [false, true]) {
      for (const plan of [false, true]) {
        const lines: string[] = [];
        const refusals: string[] = [];
        const code = await applyUpgrade({ root: s.repo, version: VERSION, steps: [touching], plan, acceptEvidenceLoss, print: (line) => lines.push(line), refuse: (reason) => refusals.push(reason) });
        expect(code).toBe(1);
        expect(refusals).toEqual([`open changes touched by step 0.1.0 -> ${VERSION}: ${s.id}, ${second}`]);
        expect(lines).toEqual([]);
      }
    }
    expect(s.readPin()).toBe("0.1.0\n");
    expect(s.porcelain()).toBe(clean);

    // The kernel's own steps: the move declares the closed siblings, the pin step nothing; an open change is never declared.
    expect(STEPS.map((step) => step.touches(s.repo))).toEqual([[], []]);
    s.pin(VERSION);
    closeFully(s);
    s.commit("close the first change");
    fs.renameSync(s.closedChangeDir, s.openChangeDir);
    s.pin(undefined);
    s.commit("the closed change as a sibling, as a 0.1.0 kernel left it");
    expect(STEPS.map((step) => step.touches(s.repo))).toEqual([[s.id], []]);

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

test(
  "UP-14 a source write pending while changes are open is refused naming the paths, proceeds with --accept-evidence-loss printing the evidence line, and the flag is a usage error elsewhere",
  () => {
    const s = prepared({ id: "C-0523-writes", checks: [automated("CK1")] });
    // The 0.1.0 shape with no ignore line and an installed skill whose text differs from the packaged one; a second
    // installed skill already equal to the packaged one is not a write.
    s.write(".claude/skills/grace5-execute/SKILL.md", "old text of the execute skill\n");
    s.write(".agents/skills/grace5-prepare/SKILL.md", readSkill("grace5-prepare/SKILL.md"));
    s.pin("0.1.0");
    s.commit("an open change, a stale skill, no ignore line");
    const clean = s.porcelain();
    const paths = ".claude/skills/grace5-execute/SKILL.md, .gitignore";

    for (const args of [["upgrade"], ["upgrade", "--plan"]]) {
      const refused = s.cli(args);
      expect(refused.code).toBe(1);
      expect(hasLine(refused, `refused: open changes present; the upgrade would write: ${paths}`)).toBe(true);
      expect(refused.out).not.toContain("step:");
      expect(refused.out).not.toContain("pinned:");
    }
    expect(s.readPin()).toBe("0.1.0\n");
    expect(s.exists(".gitignore")).toBe(false);
    expect(s.read(".claude/skills/grace5-execute/SKILL.md")).toBe("old text of the execute skill\n");
    expect(s.porcelain()).toBe(clean);

    // The flag belongs to upgrade alone.
    for (const args of [["check", s.id, "--accept-evidence-loss"], ["status", "--accept-evidence-loss"], ["run", s.id, "--start", "--accept-evidence-loss"], ["close", s.id, "--accept-evidence-loss"], ["init", "--accept-evidence-loss"]]) {
      expect(s.cli(args).code).toBe(2);
    }
    expect(s.porcelain()).toBe(clean);

    const plan = s.cli(["upgrade", "--plan", "--accept-evidence-loss"]);
    expect(plan.code).toBe(0);
    expect(hasLine(plan, "writes: .claude/skills/grace5-execute/SKILL.md")).toBe(true);
    expect(hasLine(plan, "writes: .gitignore")).toBe(true);
    expect(hasLine(plan, `open, untouched: ${s.id}`)).toBe(true);
    expect(plan.out).not.toContain("evidence of open changes");
    expect(s.porcelain()).toBe(clean);

    const upgrade = s.cli(["upgrade", "--accept-evidence-loss"]);
    expect(upgrade.code).toBe(0);
    expect(upgrade.out).not.toContain("refused:");
    expect(hasLine(upgrade, "writes: .claude/skills/grace5-execute/SKILL.md")).toBe(true);
    expect(hasLine(upgrade, "writes: .gitignore")).toBe(true);
    expect(upgrade.lines.filter((l) => l.startsWith("writes:")).length).toBe(2);
    expect(hasLine(upgrade, `open, untouched: ${s.id}`)).toBe(true);
    const evidence = upgrade.lines.indexOf(`evidence of open changes becomes history: ${s.id}`);
    expect(evidence).toBeGreaterThan(-1);
    expect(evidence).toBeLessThan(upgrade.lines.indexOf("pinned: 0.2.0"));
    expect(hasLine(upgrade, `checked: ${s.id}`)).toBe(true);
    expect(upgrade.lines.at(-1)).toBe(`upgraded: 0.1.0 -> ${VERSION}`);
    expect(s.read(".gitignore")).toBe(`${IGNORE_LINE}\n`);
    expect(s.read(".claude/skills/grace5-execute/SKILL.md")).toBe(readSkill("grace5-execute/SKILL.md"));
    expect(s.readPin()).toBe(`${VERSION}\n`);
    expect(hasLine(s.cli(["status"]), new RegExp(`^${s.id}: approved for execution, next: .+$`))).toBe(true);

    // Without open changes the same writes need no flag (UP-04); with the flag and no open change nothing is announced.
    s.commit("take the upgrade");
    closeFully(s);
    s.write(".claude/skills/grace5-execute/SKILL.md", "stale again\n");
    s.pin("0.1.0");
    s.commit("closed, the skill stale again, the state at an earlier version");
    const again = s.cli(["upgrade", "--accept-evidence-loss"]);
    expect(again.code).toBe(0);
    expect(hasLine(again, "writes: .claude/skills/grace5-execute/SKILL.md")).toBe(true);
    expect(again.out).not.toContain("open, untouched:");
    expect(again.out).not.toContain("evidence of open changes");
  },
  TEST_TIMEOUT,
);

test(
  "UP-15 writing the pin leaves every candidate and the dirty state unchanged: the pin is outside both, so a result recorded before an upgrade still counts after it",
  () => {
    const s = prepared({ id: "C-0524-pin-candidate", checks: [automated("CK1")] });
    s.write(".gitignore", `${IGNORE_LINE}\n`);
    s.commit("the ignore line, before the start");
    expect(s.start().code).toBe(0);
    const receipt = s.receipt();
    const candidate = attr(receipt, "Run", "candidate") ?? "";
    expect(HEX64.test(candidate)).toBe(true);
    expect(attr(receipt, "Run", "dirty")).toBe("false");
    expect(candidate).toBe(s.computeCandidate());
    const line = `candidate: ${candidate} (clean)`;
    expect(candidateLine(s)).toBe(line);
    s.commit("the start receipt");
    expect(candidateLine(s)).toBe(line);

    // The pin removed and left uncommitted: git sees a deletion, the kernel sees neither a dirty path nor a new candidate.
    s.pin(undefined);
    expect(s.porcelain()).toBe(` D ${PIN_PATH}\n`);
    let status = s.status();
    expect(status.lines[0]).toBe(`kernel: ${VERSION}, state: 0.1.0, run grace5 upgrade`);
    expect(hasLine(status, line)).toBe(true);
    expect(status.out).not.toContain("outside:");
    s.commit("the state without a pin");
    expect(candidateLine(s)).toBe(line);
    expect(s.computeCandidate()).toBe(candidate);

    // upgrade writes the pin: the candidate and the dirty state are as before, and the start result still counts.
    const upgrade = s.cli(["upgrade"]);
    expect(upgrade.code).toBe(0);
    expect(upgrade.lines.at(-1)).toBe(`upgraded: 0.1.0 -> ${VERSION}`);
    expect(s.porcelain()).toBe(`?? ${PIN_PATH}\n`);
    status = s.status();
    expect(status.lines[0]).toBe(`kernel: ${VERSION}, state: ${VERSION}`);
    expect(hasLine(status, line)).toBe(true);
    expect(hasLine(status, "check CK1: passed, counts")).toBe(true);
    expect(status.out).not.toContain("outside:");

    const run = s.run("--check", "CK1");
    expect(run.code).toBe(0);
    expect(attr(s.receipt(), "Run", "candidate")).toBe(candidate);
    expect(attr(s.receipt(), "Run", "dirty")).toBe("false");
    s.commit("take the pin");
    expect(candidateLine(s)).toBe(line);
    expect(s.computeCandidate()).toBe(candidate);
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

    for (const args of [["check", s.id], ["run", s.id, "--start"], ["close", s.id], ["init", "C-0526-new"], ["init"], ["upgrade"], ["upgrade", "--plan"], ["upgrade", "--accept-evidence-loss"]]) {
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
