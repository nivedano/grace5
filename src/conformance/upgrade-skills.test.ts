// Conformance cases UP-07, UP-12, UP-14, UP-15, UP-19, UP-20, UP-21, UP-22, UP-23 and AUTH-03 of models/architecture/conformance.md: the
// installed grace5-* skill directories, their refresh, the kernel-managed paths outside the candidate and the dirty
// state, upgrade beside open changes, and the kernel skill-source guard. Split mechanically from upgrade.test.ts by
// C-0010; the tests are unchanged except for UP-20.

import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { applyUpgrade, snapshot, snapshotDifference } from "../upgrade/chain";
import { STEPS, refreshSkills, skillDifferences } from "../upgrade/steps";
import { HEX64, LOCAL_IGNORE_PATH, LOCAL_IGNORE_STEP, LOCAL_IGNORE_TEXT, PACKAGED_SKILLS, PIN_PATH, TEST_TIMEOUT, UPGRADE_VERSION, asVersion010, attr, automated, candidateLine, closedPath, closeFully, disposeAll, hasLine, prepared, readSkill, sha256 } from "./helper";

const VERSION = UPGRADE_VERSION;

afterAll(() => disposeAll());

test(
  "UP-07 a later pin-only boundary preserves stale installed skills while a refresh step repairs them, both preserving open-change identity",
  async () => {
    const parts = VERSION.split(".").map(Number);
    const target = `${String(parts[0])}.${String(parts[1])}.${String((parts[2] ?? 0) + 1)}`;
    for (const withStep of [false, true]) {
      const s = prepared({ id: withStep ? "C-0533-refresh-boundary" : "C-0532-pin-only-boundary", checks: [automated("CK1")] });
      const locations = [".agents/skills/grace5-prepare", ".claude/skills/grace5-execute"];
      for (const location of locations) s.write(`${location}/SKILL.md`, "stale installed skill\n");
      s.commit("installed skills before the next version boundary");
      const beforeCandidate = candidateLine(s);
      const before = await snapshot(s.repo);
      const lines: string[] = [];
      const step = {
        from: VERSION, to: target, describe: "refresh installed skills",
        apply() {}, touches: () => [],
        verify(root: string, packaged?: string) {
          const differences = skillDifferences(root, packaged);
          if (differences.length > 0) throw new Error(`installed skills differ: ${differences.join(", ")}`);
        },
      };
      if (withStep) expect(() => step.verify(s.repo)).toThrow();
      expect(await applyUpgrade({ root: s.repo, version: target, steps: withStep ? [step] : [], plan: false, print: (line) => lines.push(line) })).toBe(0);
      expect(lines[0]).toStartWith(withStep ? `step: ${VERSION} -> ${target}:` : `bump: ${VERSION} -> ${target}:`);
      expect(lines.at(-1)).toBe(`upgraded: ${VERSION} -> ${target}`);
      expect(s.readPin()).toBe(`${target}\n`);
      for (const location of locations) {
        expect(s.read(`${location}/SKILL.md`)).toBe(withStep ? readSkill(`${location.split("/").at(-1) ?? ""}/SKILL.md`) : "stale installed skill\n");
        expect(lines.includes(`refreshed: ${location}`)).toBe(withStep);
      }
      expect(candidateLine(s)).toBe(beforeCandidate);
      expect(snapshotDifference(before, await snapshot(s.repo))).toBeUndefined();
    }
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
    // Every applied step refreshes each directory that was already installed, including later release steps.
    const stepCount = upgrade.lines.filter((line) => line.startsWith("step:")).length;
    expect(stepCount).toBeGreaterThanOrEqual(5);
    for (const rel of [".claude/skills/grace5-execute", ".agents/skills/grace5-prepare"]) {
      expect(upgrade.lines.filter((line) => line === `refreshed: ${rel}`).length).toBe(stepCount);
    }

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
    expect(s.exists(".claude/skills/grace5-orchestrate")).toBe(false);
    expect(s.exists(".agents/skills/grace5-orchestrate")).toBe(false);
    expect(s.exists("skills")).toBe(false);
    expect(s.exists("packages")).toBe(false);
  },
  TEST_TIMEOUT,
);

test(
  "UP-19 the 0.5.0 to 0.6.0 step skips the retired orchestrate install, retires legacy copies and preserves open changes",
  async () => {
    const s = prepared({ id: "C-0530-orchestrate-upgrade", checks: [automated("CK1")] });
    s.write(".agents/skills/grace5-prepare/SKILL.md", "stale prepare\n");
    s.write(".agents/skills/grace5-orchestrate/SKILL.md", "legacy orchestrate in agents\n");
    s.write(".claude/skills/grace5-orchestrate/SKILL.md", "legacy orchestrate in claude\n");
    // This location has a skill directory, but no packaged skill, so it does not qualify for installation.
    s.write(".claude/skills/grace5-local/SKILL.md", "repository-owned skill\n");
    s.commit("fixture at 0.5.0 with one installed packaged skill");
    expect(s.start().code).toBe(0);
    s.pin("0.5.0");

    const step = STEPS.find((candidate) => candidate.from === "0.5.0" && candidate.to === "0.6.0");
    expect(step).toBeDefined();
    if (step === undefined) throw new Error("missing the 0.5.0 to 0.6.0 migration step");
    expect(step.touches(s.repo)).toEqual([]);

    const beforeCandidate = candidateLine(s);
    const beforeChanges = await snapshot(s.repo);
    const receiptBefore = s.receipt();
    const runCountBefore = s.runNumbers().length;
    const readRecords = (): [string, string][] => fs.readdirSync(s.recordsDir).sort()
      .filter((name) => fs.statSync(path.join(s.recordsDir, name)).isFile())
      .map((name) => [name, fs.readFileSync(path.join(s.recordsDir, name)).toString("hex")]);
    const recordsBefore = readRecords();

    // Applying the step once and twice, with the runner's mirror after each application, produces the same tree.
    step.apply(s.repo);
    expect(refreshSkills(s.repo)).not.toContain(".agents/skills/grace5-orchestrate");
    step.verify(s.repo);
    expect(s.exists(".agents/skills/grace5-orchestrate")).toBe(false);
    const oncePorcelain = s.porcelain();
    step.apply(s.repo);
    refreshSkills(s.repo);
    step.verify(s.repo);
    expect(s.porcelain()).toBe(oncePorcelain);
    expect(s.exists(".agents/skills/grace5-orchestrate")).toBe(false);
    expect(s.exists(".claude/skills/grace5-orchestrate")).toBe(false);
    expect(s.read(".claude/skills/grace5-local/SKILL.md")).toBe("repository-owned skill\n");
    expect(s.exists(".agents/skills/grace5-review")).toBe(false);

    // Current packages skip the obsolete install; verification catches a lingering retired directory.
    fs.mkdirSync(path.join(s.repo, ".agents/skills/grace5-orchestrate"), { recursive: true });
    fs.writeFileSync(path.join(s.repo, ".agents/skills/grace5-orchestrate/SKILL.md"), "retired\n");
    expect(() => step.verify(s.repo)).toThrow();
    const removed: string[] = [];
    refreshSkills(s.repo, PACKAGED_SKILLS, (rel) => removed.push(rel));
    expect(removed).toContain(".agents/skills/grace5-orchestrate");
    expect(s.exists(".agents/skills/grace5-orchestrate")).toBe(false);
    expect(s.read(".claude/skills/grace5-local/SKILL.md")).toBe("repository-owned skill\n");

    // No location is made when the repository has no installed packaged skills.
    const empty = prepared({ id: "C-0531-no-installed-skills", checks: [automated("CK1")] });
    step.apply(empty.repo);
    refreshSkills(empty.repo);
    step.verify(empty.repo);
    expect(empty.exists(".agents/skills")).toBe(false);
    expect(empty.exists(".claude/skills")).toBe(false);

    // Restore the valid shape and exercise the real command through the historical boundary to the current target.
    step.apply(s.repo);
    refreshSkills(s.repo);
    step.verify(s.repo);
    const upgrade = s.cli(["upgrade"]);
    expect(upgrade.code).toBe(0);
    expect(upgrade.lines).toContain("step: 0.5.0 -> 0.6.0: install grace5-orchestrate beside the installed skills and refresh them to 0.6.0");
    expect(upgrade.lines).toContain(`checked: ${s.id}`);
    expect(s.readPin()).toBe(`${VERSION}\n`);

    expect(candidateLine(s)).toBe(beforeCandidate);
    const afterChanges = await snapshot(s.repo);
    expect(snapshotDifference(beforeChanges, afterChanges)).toBeUndefined();
    expect(s.receipt()).toBe(receiptBefore);
    expect(s.runNumbers()).toHaveLength(runCountBefore);
    expect(readRecords()).toEqual(recordsBefore);
    expect(hasLine(s.status(), "check CK1: passed, counts")).toBe(true);
  },
  TEST_TIMEOUT,
);

test(
  "UP-12 upgrade proceeds without a flag with open changes present, stale installed skills and no local ignore file, lists the changes as open, untouched, leaves their candidate, dirty state and evidence as before, and the post-upgrade check covers them; --accept-evidence-loss is a usage error everywhere",
  () => {
    const closed = "C-0519-closed-beside";
    const s = prepared({ id: closed, checks: [automated("CK1")] });
    closeFully(s);
    s.commit("close the first change");
    // An open change with a start result, so that there is evidence to keep.
    const open = "C-0520-open";
    s.writeContract({ id: open, checks: [automated("CK1")] });
    s.prepare();
    expect(s.start().code).toBe(0);
    // Installed skills, one stale and one already equal to the packaged copy; the closed change under closed/; no pin;
    // no local ignore file; the project's .gitignore absent.
    s.write(".claude/skills/grace5-execute/SKILL.md", "old text of the execute skill\n");
    s.write(".agents/skills/grace5-prepare/SKILL.md", readSkill("grace5-prepare/SKILL.md"));
    s.pin(undefined);
    fs.rmSync(path.join(s.repo, ".gitignore"), { force: true });
    fs.rmSync(path.join(s.repo, LOCAL_IGNORE_PATH), { force: true });
    s.commit("an open change with a result beside a closed one, a stale skill, state without a pin");
    const clean = s.porcelain();
    const contractSha = sha256(s.read(`.grace5/changes/${open}/contract.xml`).replace(/\r\n/g, "\n"));
    const before = candidateLine(s, open);
    expect(before).toMatch(/^candidate: [0-9a-f]{64} \(clean\)$/);
    expect(hasLine(s.status(), "check CK1: passed, counts")).toBe(true);
    const receiptBefore = s.receipt();

    const plan = s.cli(["upgrade", "--plan"]);
    expect(plan.code).toBe(0);
    expect(hasLine(plan, `open, untouched: ${open}`)).toBe(true);
    expect(hasLine(plan, "scope: upgrade paths (.grace5/ and installed packaged skills) are kernel-managed, excluded from candidate, dirty state and Protected checks even under matching globs; neighbouring project skills remain source")).toBe(true);
    expect(plan.lines.some((line) => line.startsWith("resume:"))).toBe(false);
    expect(hasLine(plan, LOCAL_IGNORE_STEP)).toBe(true);
    expect(plan.out).not.toContain("writes:");
    expect(plan.out).not.toContain("refused:");
    expect(s.porcelain()).toBe(clean);
    expect(s.readPin()).toBeUndefined();

    const upgrade = s.cli(["upgrade"]);
    expect(upgrade.code).toBe(0);
    expect(hasLine(upgrade, `open, untouched: ${open}`)).toBe(true);
    expect(hasLine(upgrade, "refreshed: .claude/skills/grace5-execute")).toBe(true);
    expect(hasLine(upgrade, "refreshed: .agents/skills/grace5-prepare")).toBe(true);
    expect(upgrade.out).not.toContain("writes:");
    expect(upgrade.out).not.toContain("evidence of open changes");
    expect(upgrade.out).not.toContain("refused:");
    expect(hasLine(upgrade, `checked: ${open}`)).toBe(true);
    expect(hasLine(upgrade, `checked: ${closed}`)).toBe(true);
    expect(upgrade.lines.find((line) => line.startsWith("scope:"))).toBe(plan.lines.find((line) => line.startsWith("scope:")));
    expect(hasLine(upgrade, `resume: ${open}: keep the contract and original start; grace5 status ${open} reports remaining obligations, including evidence invalidated by a candidate-rule change`)).toBe(true);
    expect(upgrade.lines.some((line) => line.startsWith(`resume: ${closed}:`))).toBe(false);
    expect(upgrade.lines.at(-1)).toBe(`upgraded: 0.1.0 -> ${VERSION}`);
    expect(s.readPin()).toBe(`${VERSION}\n`);
    expect(s.read(".claude/skills/grace5-execute/SKILL.md")).toBe(readSkill("grace5-execute/SKILL.md"));
    expect(s.read(LOCAL_IGNORE_PATH)).toBe(LOCAL_IGNORE_TEXT);
    expect(s.exists(".gitignore")).toBe(false);
    // Git sees the refreshed skill, the local ignore file and the pin; the kernel sees none of them: the candidate is
    // clean and as before, nothing under the open change was written, and the result still counts.
    expect(s.porcelain()).toContain(".claude/skills/grace5-execute/SKILL.md");
    expect(s.porcelain()).toContain(`?? ${PIN_PATH}`);
    expect(s.porcelain()).toContain(`?? ${LOCAL_IGNORE_PATH}`);
    expect(s.receipt()).toBe(receiptBefore);
    expect(fs.existsSync(path.join(s.repo, ".grace5", "changes", open, "records", "close.xml"))).toBe(false);
    const status = s.status();
    expect(status.lines[0]).toBe(`kernel: ${VERSION}, state: ${VERSION}`);
    expect(hasLine(status, before)).toBe(true);
    expect(hasLine(status, "check CK1: passed, counts")).toBe(true);
    expect(status.out).not.toContain("outside:");

    const listing = s.cli(["status", "--all"]);
    expect(hasLine(listing, new RegExp(`^${open}: approved, next: .+$`))).toBe(true);
    expect(hasLine(listing, `${closed}: closed`)).toBe(true);
    expect(listing.lines.at(-1)).toBe("closed changes: 1");
    const check = s.check(open);
    expect(check.code).toBe(0);
    expect(check.contractSha).toBe(contractSha);
    // A receipt taken afterwards carries the same candidate, clean.
    expect(s.run("--check", "CK1").code).toBe(0);
    expect(`candidate: ${attr(s.receipt(), "Run", "candidate") ?? ""} (clean)`).toBe(before);
    expect(attr(s.receipt(), "Run", "dirty")).toBe("false");

    // There is no flag: --accept-evidence-loss is a usage error on upgrade like on every other command, and writes nothing.
    s.commit("take the upgrade");
    s.pin(undefined);
    s.commit("the pin removed again");
    const taken = s.porcelain();
    for (const args of [["upgrade", "--accept-evidence-loss"], ["upgrade", "--plan", "--accept-evidence-loss"], ["check", open, "--accept-evidence-loss"], ["status", "--accept-evidence-loss"], ["run", open, "--start", "--accept-evidence-loss"], ["close", open, "--accept-evidence-loss"], ["init", "--accept-evidence-loss"]]) {
      const usage = s.cli(args);
      expect(usage.code).toBe(2);
      expect(usage.out).not.toContain("step:");
      expect(usage.out).not.toContain("pinned:");
    }
    expect(s.porcelain()).toBe(taken);
    expect(s.readPin()).toBeUndefined();
  },
  TEST_TIMEOUT,
);

test(
  "AUTH-03 upgrade from 0.5.0 only refreshes skills and the pin; a legacy false approval stays unchanged and can start",
  () => {
    const s = prepared({ id: "C-0529-legacy-approval", checks: [automated("CK1")] });
    s.writeApproval({ executes: false });
    s.write(".agents/skills/grace5-prepare/SKILL.md", "stale prepare skill\n");
    s.pin("0.5.0");
    s.commit("a pilot at 0.5.0 with a legacy approval");
    const before = candidateLine(s);
    const records = fs.readdirSync(s.recordsDir).sort().map((name) => [name, fs.readFileSync(path.join(s.recordsDir, name)).toString("hex")]);
    const checkBefore = s.read(`.grace5/changes/${s.id}/contract.xml`);
    const upgrade = s.cli(["upgrade"]);
    expect(upgrade.code).toBe(0);
    const links = upgrade.lines.filter((line) => /^(step|bump):/.test(line));
    expect(links[0]).toBe("step: 0.5.0 -> 0.6.0: install grace5-orchestrate beside the installed skills and refresh them to 0.6.0");
    expect(upgrade.lines.at(-1)).toBe(`upgraded: 0.5.0 -> ${VERSION}`);
    expect(s.readPin()).toBe(`${VERSION}\n`);
    expect(s.read(".agents/skills/grace5-prepare/SKILL.md")).toBe(readSkill("grace5-prepare/SKILL.md"));
    expect(s.porcelain().split("\n").filter(Boolean).map((line) => line.slice(3)).sort()).toEqual([".agents/skills/grace5-prepare/SKILL.md", PIN_PATH].sort());
    expect(fs.readdirSync(s.recordsDir).sort().map((name) => [name, fs.readFileSync(path.join(s.recordsDir, name)).toString("hex")])).toEqual(records);
    expect(s.read(`.grace5/changes/${s.id}/contract.xml`)).toBe(checkBefore);
    expect(candidateLine(s)).toBe(before);
    expect(hasLine(s.status(), "authorization: approved")).toBe(true);
    expect(s.check().defects).toEqual([]);
    expect(s.start().code).toBe(0);
  },
  TEST_TIMEOUT,
);

test(
  "UP-14 the kernel-managed paths are outside the candidate, the dirty state and the complete diff: a write under .grace5/ or an installed grace5-* skill directory changes no evidence and is never outside or protected, while a repository's own skill beside them is source",
  () => {
    // A change that protects .agents/**, as the pilot of the Problem did; the installed kernel skills live there.
    const s = prepared({ id: "C-0523-managed", checks: [automated("CK1")], paths: ["src/**"], protectedPaths: [".agents/**"] });
    s.write(".agents/skills/grace5-prepare/SKILL.md", "old text of the prepare skill\n");
    s.write(".claude/skills/grace5-execute/SKILL.md", "old text of the execute skill\n");
    s.write(".agents/skills/grace5-mine/SKILL.md", "a skill of this repository, not the kernel's\n");
    s.write(".grace5/README.md", "# .grace5\n");
    s.commit("installed skills, a skill of the repository, the state's entry point");
    expect(s.start().code).toBe(0);
    const candidate = attr(s.receipt(), "Run", "candidate") ?? "";
    expect(HEX64.test(candidate)).toBe(true);
    expect(candidate).toBe(s.computeCandidate());
    s.commit("the start receipt");
    const line = `candidate: ${candidate} (clean)`;
    expect(candidateLine(s)).toBe(line);
    const settled = s.porcelain();

    // Writes an upgrade makes, left uncommitted: a refreshed skill in each location, a new file under a managed skill
    // directory, the entry point rewritten, the local ignore file created. Git sees them; the kernel does not.
    s.write(".agents/skills/grace5-prepare/SKILL.md", readSkill("grace5-prepare/SKILL.md"));
    s.write(".claude/skills/grace5-execute/SKILL.md", readSkill("grace5-execute/SKILL.md"));
    s.write(".claude/skills/grace5-execute/reference.md", "a file the package may carry one day\n");
    s.write(".grace5/README.md", "# .grace5\n\nrewritten\n");
    s.write(LOCAL_IGNORE_PATH, LOCAL_IGNORE_TEXT);
    expect(s.porcelain()).not.toBe(settled);
    let status = s.status();
    expect(hasLine(status, line)).toBe(true);
    expect(hasLine(status, "check CK1: passed, counts")).toBe(true);
    expect(status.out).not.toContain("outside:");
    expect(status.out).not.toContain("protected:");
    expect(s.run("--check", "CK1").code).toBe(0);
    expect(attr(s.receipt(), "Run", "candidate")).toBe(candidate);
    expect(attr(s.receipt(), "Run", "dirty")).toBe("false");
    // Committed, they change the candidate as little; the complete diff from the start carries them and reports none.
    s.commit("the kernel-managed writes");
    expect(s.computeCandidate()).toBe(candidate);
    status = s.status();
    expect(hasLine(status, line)).toBe(true);
    expect(hasLine(status, "check CK1: passed, counts")).toBe(true);
    expect(status.out).not.toContain("outside:");
    expect(status.out).not.toContain("protected:");

    // The repository's own skill beside them, and any other path, is source: dirty, then a new candidate, reported
    // protected or outside, and the complete diff refused at close.
    const before = s.head();
    s.write(".agents/skills/grace5-mine/SKILL.md", "edited\n");
    s.write("docs/note.md", "edited\n");
    status = s.status();
    expect(hasLine(status, `candidate: ${candidate} (dirty)`)).toBe(true);
    expect(hasLine(status, "protected: .agents/skills/grace5-mine/SKILL.md")).toBe(true);
    expect(hasLine(status, "outside: docs/note.md")).toBe(true);
    s.commit("the repository's own skill and a document");
    expect(s.computeCandidate()).not.toBe(candidate);
    status = s.status();
    expect(hasLine(status, `candidate: ${s.computeCandidate()} (clean)`)).toBe(true);
    expect(hasLine(status, "check CK1: passed, does not count: recorded on an earlier candidate")).toBe(true);
    expect(hasLine(status, "protected: .agents/skills/grace5-mine/SKILL.md")).toBe(true);
    s.writeReview();
    const refused = s.close();
    expect(refused.code).toBe(1);
    expect(hasLine(refused, "refused: protected path touched: .agents/skills/grace5-mine/SKILL.md")).toBe(true);

    // Restored, the tree is the earlier candidate again, and the change closes: the committed writes under the installed
    // skill directory and under .grace5/ in the diff range are no protected touch.
    s.git("checkout", before, "--", ".agents/skills/grace5-mine/SKILL.md", "docs/note.md");
    s.commit("restore the repository's own skill and the document");
    expect(s.computeCandidate()).toBe(candidate);
    expect(hasLine(s.status(), "check CK1: passed, counts")).toBe(true);
    s.writeReview();
    const close = s.close();
    expect(close.code).toBe(0);
    expect(hasLine(close, `closed: ${closedPath(s.id)}/records/close.xml`)).toBe(true);
  },
  TEST_TIMEOUT,
);

test(
  "UP-15 writing the pin leaves every candidate and the dirty state unchanged: the pin is a kernel-managed path outside both, so a result recorded before an upgrade still counts after it",
  () => {
    const s = prepared({ id: "C-0524-pin-candidate", checks: [automated("CK1")] });
    s.write(LOCAL_IGNORE_PATH, LOCAL_IGNORE_TEXT);
    s.commit("the local ignore file, before the start");
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

/** A throwaway kernel checkout with its skill source committed; the caller dirties it. */
function kernelRepo(dir: string): string {
  const root = path.join(dir, "kernel");
  const rel = "skills/grace5-prepare";
  fs.mkdirSync(path.join(root, rel), { recursive: true });
  fs.writeFileSync(path.join(root, rel, "SKILL.md"), `${rel}\n`);
  const git = (...args: string[]): void => {
    const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(String(result.stderr));
  };
  git("init", "-q");
  git("config", "user.name", "Conformance Fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "core.autocrlf", "false");
  git("config", "commit.gpgsign", "false");
  git("add", "-A");
  git("commit", "-q", "-m", "kernel");
  return root;
}

test(
  "UP-20 upgrade refuses before the plan when the kernel's skill source differs from HEAD, and a clean or pin-bump chain is unaffected",
  async () => {
    const s = prepared({ id: "C-0534-kernel-source", checks: [automated("CK1")] });
    s.pin("0.5.0");
    s.write(".claude/skills/grace5-execute/SKILL.md", "old execute\n");
    s.commit("installed skill at 0.5.0");

    const kernel = kernelRepo(s.scratch);
    fs.writeFileSync(path.join(kernel, "skills", "grace5-prepare", "SKILL.md"), "edited source\n");
    // A generated packages/ tree is a build output, not a skill source the guard reads.
    fs.mkdirSync(path.join(kernel, "packages", "skills", "grace5-prepare"), { recursive: true });
    fs.writeFileSync(path.join(kernel, "packages", "skills", "grace5-prepare", "SKILL.md"), "generated\n");

    const refused: string[] = [];
    const lines: string[] = [];
    expect(
      await applyUpgrade({
        root: s.repo,
        version: VERSION,
        steps: STEPS,
        plan: false,
        print: (line) => lines.push(line),
        refuse: (reason) => refused.push(reason),
        kernelRoot: kernel,
        packagedSkills: PACKAGED_SKILLS,
      }),
    ).toBe(1);
    expect(refused).toHaveLength(1);
    expect(refused[0]).toStartWith("kernel skills are modified relative to HEAD: skills/grace5-prepare/SKILL.md");
    expect(lines).toHaveLength(0);
    expect(s.readPin()).toBe("0.5.0\n");

    // A pin bump reads no skills, so the same dirty source is not consulted.
    const bumpLines: string[] = [];
    const bumpRefused: string[] = [];
    expect(
      await applyUpgrade({
        root: s.repo,
        version: "0.5.1",
        steps: [],
        plan: false,
        print: (line) => bumpLines.push(line),
        refuse: (reason) => bumpRefused.push(reason),
        kernelRoot: kernel,
        packagedSkills: PACKAGED_SKILLS,
      }),
    ).toBe(0);
    expect(bumpRefused).toHaveLength(0);
    expect(bumpLines[0]).toStartWith("bump: 0.5.0 -> 0.5.1:");
    expect(s.readPin()).toBe("0.5.1\n");

    // A clean kernel source upgrades normally and refreshes the installed skill.
    s.pin("0.5.0");
    s.commit("the pin again");
    const clean = kernelRepo(path.join(s.scratch, "clean"));
    const cleanLines: string[] = [];
    const cleanRefused: string[] = [];
    expect(
      await applyUpgrade({
        root: s.repo,
        version: VERSION,
        steps: STEPS,
        plan: false,
        print: (line) => cleanLines.push(line),
        refuse: (reason) => cleanRefused.push(reason),
        kernelRoot: clean,
        packagedSkills: PACKAGED_SKILLS,
      }),
    ).toBe(0);
    expect(cleanRefused).toHaveLength(0);
    expect(cleanLines).toContain("refreshed: .claude/skills/grace5-execute");
    expect(cleanLines).not.toContain("refreshed: .claude/skills/grace5-orchestrate");
    expect(cleanLines.at(-1)).toBe(`upgraded: 0.5.0 -> ${VERSION}`);
    expect(s.read(".claude/skills/grace5-execute/SKILL.md")).toBe(readSkill("grace5-execute/SKILL.md"));
  },
  TEST_TIMEOUT,
);

test(
  "UP-21 the 0.6.0 to 0.7.0 step skips the retired orchestrate install, retires legacy copies and preserves open changes",
  async () => {
    const s = prepared({ id: "C-0536-orchestrate-07", checks: [automated("CK1")] });
    s.write(".agents/skills/grace5-prepare/SKILL.md", "stale prepare\n");
    s.write(".claude/skills/grace5-local/SKILL.md", "repository-owned skill\n");
    s.commit("fixture at 0.6.0 with one installed packaged skill");
    expect(s.start().code).toBe(0);
    s.pin("0.6.0");

    const step = STEPS.find((candidate) => candidate.from === "0.6.0" && candidate.to === "0.7.0");
    expect(step).toBeDefined();
    if (step === undefined) throw new Error("missing the 0.6.0 to 0.7.0 migration step");
    expect(step.touches(s.repo)).toEqual([]);

    const beforeCandidate = candidateLine(s);
    const beforeChanges = await snapshot(s.repo);
    const receiptBefore = s.receipt();
    const runCountBefore = s.runNumbers().length;

    step.apply(s.repo);
    expect(refreshSkills(s.repo)).not.toContain(".agents/skills/grace5-orchestrate");
    step.verify(s.repo);
    expect(s.exists(".agents/skills/grace5-orchestrate")).toBe(false);
    expect(s.read(".agents/skills/grace5-prepare/SKILL.md")).toBe(readSkill("grace5-prepare/SKILL.md"));
    expect(s.exists(".claude/skills/grace5-orchestrate")).toBe(false);
    expect(s.read(".claude/skills/grace5-local/SKILL.md")).toBe("repository-owned skill\n");

    // Applying it twice changes nothing, and verification rejects a lingering retired directory.
    const oncePorcelain = s.porcelain();
    step.apply(s.repo);
    refreshSkills(s.repo);
    step.verify(s.repo);
    expect(s.porcelain()).toBe(oncePorcelain);
    fs.mkdirSync(path.join(s.repo, ".agents/skills/grace5-orchestrate"), { recursive: true });
    fs.writeFileSync(path.join(s.repo, ".agents/skills/grace5-orchestrate/SKILL.md"), "retired\n");
    expect(() => step.verify(s.repo)).toThrow();
    refreshSkills(s.repo);
    expect(s.exists(".agents/skills/grace5-orchestrate")).toBe(false);
    step.verify(s.repo);

    const upgrade = s.cli(["upgrade"]);
    expect(upgrade.code).toBe(0);
    expect(upgrade.lines).toContain("step: 0.6.0 -> 0.7.0: install grace5-orchestrate beside the installed skills and refresh them to 0.7.0");
    expect(s.exists(".agents/skills/grace5-orchestrate")).toBe(false);
    expect(upgrade.lines.at(-1)).toBe(`upgraded: 0.6.0 -> ${VERSION}`);
    expect(s.readPin()).toBe(`${VERSION}\n`);
    expect(candidateLine(s)).toBe(beforeCandidate);
    expect(snapshotDifference(beforeChanges, await snapshot(s.repo))).toBeUndefined();
    expect(s.receipt()).toBe(receiptBefore);
    expect(s.runNumbers()).toHaveLength(runCountBefore);
    expect(hasLine(s.status(), "check CK1: passed, counts")).toBe(true);
  },
  TEST_TIMEOUT,
);

test(
  "UP-22 the 0.7.0 to 0.8.0 step refreshes the installed skills, is idempotent and self-verifying, and leaves open changes untouched",
  async () => {
    const s = prepared({ id: "C-0538-refresh-08", checks: [automated("CK1")] });
    s.write(".agents/skills/grace5-prepare/SKILL.md", "stale prepare\n");
    s.write(".claude/skills/grace5-execute/SKILL.md", "stale execute\n");
    s.write(".claude/skills/grace5-local/SKILL.md", "repository-owned skill\n");
    s.commit("fixture at 0.7.0 with installed packaged skills");
    expect(s.start().code).toBe(0);
    s.pin("0.7.0");

    const step = STEPS.find((candidate) => candidate.from === "0.7.0" && candidate.to === "0.8.0");
    expect(step).toBeDefined();
    if (step === undefined) throw new Error("missing the 0.7.0 to 0.8.0 migration step");
    expect(step.touches(s.repo)).toEqual([]);

    const beforeCandidate = candidateLine(s);
    const beforeChanges = await snapshot(s.repo);
    const receiptBefore = s.receipt();
    const runCountBefore = s.runNumbers().length;

    // apply writes nothing itself: the runner's refresh carries the step, so the tree is untouched by it.
    const afterApply = s.porcelain();
    step.apply(s.repo);
    expect(s.porcelain()).toBe(afterApply);
    expect(refreshSkills(s.repo)).toContain(".agents/skills/grace5-prepare");
    expect(refreshSkills(s.repo)).toContain(".claude/skills/grace5-execute");
    step.verify(s.repo);
    expect(s.read(".agents/skills/grace5-prepare/SKILL.md")).toBe(readSkill("grace5-prepare/SKILL.md"));
    expect(s.read(".claude/skills/grace5-execute/SKILL.md")).toBe(readSkill("grace5-execute/SKILL.md"));
    expect(s.read(".claude/skills/grace5-local/SKILL.md")).toBe("repository-owned skill\n");

    // Applying it twice changes nothing, and verification rejects a missing or drifted installed file.
    const oncePorcelain = s.porcelain();
    step.apply(s.repo);
    refreshSkills(s.repo);
    step.verify(s.repo);
    expect(s.porcelain()).toBe(oncePorcelain);
    fs.rmSync(path.join(s.repo, ".agents/skills/grace5-prepare/SKILL.md"), { force: true });
    expect(() => step.verify(s.repo)).toThrow();
    step.apply(s.repo);
    refreshSkills(s.repo);
    fs.writeFileSync(path.join(s.repo, ".agents/skills/grace5-prepare/SKILL.md"), "drifted\n");
    expect(() => step.verify(s.repo)).toThrow();
    step.apply(s.repo);
    refreshSkills(s.repo);
    step.verify(s.repo);

    // No location is made when the repository has no installed packaged skills.
    const empty = prepared({ id: "C-0539-no-installed-skills-08", checks: [automated("CK1")] });
    step.apply(empty.repo);
    refreshSkills(empty.repo);
    step.verify(empty.repo);
    expect(empty.exists(".agents/skills")).toBe(false);
    expect(empty.exists(".claude/skills")).toBe(false);

    // Restore the valid shape and exercise the real command through the historical boundary to the current target.
    step.apply(s.repo);
    refreshSkills(s.repo);
    step.verify(s.repo);
    const upgrade = s.cli(["upgrade"]);
    expect(upgrade.code).toBe(0);
    expect(upgrade.lines).toContain("step: 0.7.0 -> 0.8.0: refresh the installed skills to 0.8.0");
    expect(upgrade.lines).toContain(`checked: ${s.id}`);
    expect(upgrade.lines.at(-1)).toBe(`upgraded: 0.7.0 -> ${VERSION}`);
    expect(s.readPin()).toBe(`${VERSION}\n`);
    expect(candidateLine(s)).toBe(beforeCandidate);
    expect(snapshotDifference(beforeChanges, await snapshot(s.repo))).toBeUndefined();
    expect(s.receipt()).toBe(receiptBefore);
    expect(s.runNumbers()).toHaveLength(runCountBefore);
    expect(hasLine(s.status(), "check CK1: passed, counts")).toBe(true);
  },
  TEST_TIMEOUT,
);

test(
  "UP-23 the 0.8.0 to 0.9.0 step refreshes the installed skills, removes the retired orchestrate installation, is idempotent and self-verifying, and leaves open changes untouched",
  async () => {
    const s = prepared({ id: "C-0540-refresh-09", checks: [automated("CK1")] });
    s.write(".agents/skills/grace5-prepare/SKILL.md", "stale prepare\n");
    s.write(".claude/skills/grace5-execute/SKILL.md", "stale execute\n");
    s.write(".agents/skills/grace5-orchestrate/SKILL.md", "legacy orchestrate in agents\n");
    s.write(".claude/skills/grace5-orchestrate/SKILL.md", "legacy orchestrate in claude\n");
    s.write(".claude/skills/grace5-local/SKILL.md", "repository-owned skill\n");
    s.commit("fixture at 0.8.0 with installed packaged skills and legacy orchestrate copies");
    expect(s.start().code).toBe(0);
    s.pin("0.8.0");

    const step = STEPS.find((candidate) => candidate.from === "0.8.0" && candidate.to === "0.9.0");
    expect(step).toBeDefined();
    if (step === undefined) throw new Error("missing the 0.8.0 to 0.9.0 migration step");
    expect(step.touches(s.repo)).toEqual([]);

    const beforeCandidate = candidateLine(s);
    const beforeChanges = await snapshot(s.repo);
    const receiptBefore = s.receipt();
    const runCountBefore = s.runNumbers().length;

    // apply writes nothing itself: the runner's refresh carries the step, and removes the retired directories.
    const afterApply = s.porcelain();
    step.apply(s.repo);
    expect(s.porcelain()).toBe(afterApply);
    expect(refreshSkills(s.repo)).toContain(".agents/skills/grace5-prepare");
    expect(s.exists(".agents/skills/grace5-orchestrate")).toBe(false);
    expect(s.exists(".claude/skills/grace5-orchestrate")).toBe(false);
    step.verify(s.repo);
    expect(s.read(".agents/skills/grace5-prepare/SKILL.md")).toBe(readSkill("grace5-prepare/SKILL.md"));
    expect(s.read(".claude/skills/grace5-execute/SKILL.md")).toBe(readSkill("grace5-execute/SKILL.md"));
    expect(s.read(".claude/skills/grace5-local/SKILL.md")).toBe("repository-owned skill\n");

    // Applying it twice changes nothing; verification rejects a lingering retired directory and a drifted file.
    const oncePorcelain = s.porcelain();
    step.apply(s.repo);
    refreshSkills(s.repo);
    step.verify(s.repo);
    expect(s.porcelain()).toBe(oncePorcelain);
    fs.mkdirSync(path.join(s.repo, ".agents/skills/grace5-orchestrate"), { recursive: true });
    fs.writeFileSync(path.join(s.repo, ".agents/skills/grace5-orchestrate/SKILL.md"), "retired\n");
    expect(() => step.verify(s.repo)).toThrow();
    refreshSkills(s.repo);
    step.verify(s.repo);
    fs.writeFileSync(path.join(s.repo, ".agents/skills/grace5-prepare/SKILL.md"), "drifted\n");
    expect(() => step.verify(s.repo)).toThrow();
    step.apply(s.repo);
    refreshSkills(s.repo);
    step.verify(s.repo);

    // No location is made when the repository has no installed packaged skills.
    const empty = prepared({ id: "C-0541-no-installed-skills-09", checks: [automated("CK1")] });
    step.apply(empty.repo);
    refreshSkills(empty.repo);
    step.verify(empty.repo);
    expect(empty.exists(".agents/skills")).toBe(false);
    expect(empty.exists(".claude/skills")).toBe(false);

    // Exercise the real command through the historical boundary to the current target.
    step.apply(s.repo);
    refreshSkills(s.repo);
    step.verify(s.repo);
    const upgrade = s.cli(["upgrade"]);
    expect(upgrade.code).toBe(0);
    expect(upgrade.lines).toContain("step: 0.8.0 -> 0.9.0: refresh the installed skills to 0.9.0 and remove the retired grace5-orchestrate installation");
    expect(upgrade.lines).toContain(`checked: ${s.id}`);
    expect(upgrade.lines.at(-1)).toBe(`upgraded: 0.8.0 -> ${VERSION}`);
    expect(s.readPin()).toBe(`${VERSION}\n`);
    expect(candidateLine(s)).toBe(beforeCandidate);
    expect(snapshotDifference(beforeChanges, await snapshot(s.repo))).toBeUndefined();
    expect(s.receipt()).toBe(receiptBefore);
    expect(s.runNumbers()).toHaveLength(runCountBefore);
    expect(hasLine(s.status(), "check CK1: passed, counts")).toBe(true);
  },
  TEST_TIMEOUT,
);

test(
  "UP-24 the 0.9.0 to 0.9.1 step refreshes the installed skills, is idempotent and self-verifying, and leaves open changes untouched",
  async () => {
    const s = prepared({ id: "C-0542-refresh-091", checks: [automated("CK1")] });
    s.write(".agents/skills/grace5-prepare/SKILL.md", "stale prepare\n");
    s.write(".claude/skills/grace5-execute/SKILL.md", "stale execute\n");
    s.write(".claude/skills/grace5-local/SKILL.md", "repository-owned skill\n");
    s.commit("fixture at 0.9.0 with installed packaged skills");
    expect(s.start().code).toBe(0);
    s.pin("0.9.0");

    const step = STEPS.find((candidate) => candidate.from === "0.9.0" && candidate.to === "0.9.1");
    expect(step).toBeDefined();
    if (step === undefined) throw new Error("missing the 0.9.0 to 0.9.1 migration step");
    expect(step.touches(s.repo)).toEqual([]);

    const beforeCandidate = candidateLine(s);
    const beforeChanges = await snapshot(s.repo);
    const receiptBefore = s.receipt();
    const runCountBefore = s.runNumbers().length;

    const afterApply = s.porcelain();
    step.apply(s.repo);
    expect(s.porcelain()).toBe(afterApply);
    expect(refreshSkills(s.repo)).toContain(".agents/skills/grace5-prepare");
    expect(refreshSkills(s.repo)).toContain(".claude/skills/grace5-execute");
    step.verify(s.repo);
    expect(s.read(".agents/skills/grace5-prepare/SKILL.md")).toBe(readSkill("grace5-prepare/SKILL.md"));
    expect(s.read(".claude/skills/grace5-execute/SKILL.md")).toBe(readSkill("grace5-execute/SKILL.md"));
    expect(s.read(".claude/skills/grace5-local/SKILL.md")).toBe("repository-owned skill\n");

    const oncePorcelain = s.porcelain();
    step.apply(s.repo);
    refreshSkills(s.repo);
    step.verify(s.repo);
    expect(s.porcelain()).toBe(oncePorcelain);
    fs.rmSync(path.join(s.repo, ".agents/skills/grace5-prepare/SKILL.md"), { force: true });
    expect(() => step.verify(s.repo)).toThrow();
    step.apply(s.repo);
    refreshSkills(s.repo);
    fs.writeFileSync(path.join(s.repo, ".agents/skills/grace5-prepare/SKILL.md"), "drifted\n");
    expect(() => step.verify(s.repo)).toThrow();
    step.apply(s.repo);
    refreshSkills(s.repo);
    step.verify(s.repo);

    const empty = prepared({ id: "C-0543-no-installed-skills-091", checks: [automated("CK1")] });
    step.apply(empty.repo);
    refreshSkills(empty.repo);
    step.verify(empty.repo);
    expect(empty.exists(".agents/skills")).toBe(false);
    expect(empty.exists(".claude/skills")).toBe(false);

    step.apply(s.repo);
    refreshSkills(s.repo);
    step.verify(s.repo);
    const upgrade = s.cli(["upgrade"]);
    expect(upgrade.code).toBe(0);
    expect(upgrade.lines).toContain("step: 0.9.0 -> 0.9.1: refresh the installed skills to 0.9.1");
    expect(upgrade.lines).toContain(`checked: ${s.id}`);
    expect(upgrade.lines.at(-1)).toBe(`upgraded: 0.9.0 -> ${VERSION}`);
    expect(s.readPin()).toBe(`${VERSION}\n`);
    expect(candidateLine(s)).toBe(beforeCandidate);
    expect(snapshotDifference(beforeChanges, await snapshot(s.repo))).toBeUndefined();
    expect(s.receipt()).toBe(receiptBefore);
    expect(s.runNumbers()).toHaveLength(runCountBefore);
    expect(hasLine(s.status(), "check CK1: passed, counts")).toBe(true);
  },
  TEST_TIMEOUT,
);
