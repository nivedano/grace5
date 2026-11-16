// Conformance cases CK2 of C-0014-installation-ownership for the installation-health tool
// (upgrade.md, source-identity.md): a clean installation matches the packaged skills, a corrupted
// installed file fails and names the differing path, restoring the exact bytes passes, a project-owned
// skill beside the installed ones is ignored, and a missing packaged source is an actionable error
// rather than a pass. Every root is a throwaway directory; this repository's own installed skills are
// never read.

import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { installationHealth } from "./installation-health";
import { PACKAGED_SKILLS_DIR, SKILL_LOCATIONS, packagedSkillNames } from "../upgrade/skills";

const TOOL = resolve(import.meta.dir, "installation-health.ts");
const PACKAGED_NAMES = packagedSkillNames();
const TIMEOUT = 60_000;

const TEMP_DIRS: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "grace5-health-"));
  TEMP_DIRS.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of TEMP_DIRS) rmSync(dir, { recursive: true, force: true });
});

function firstName(): string {
  const name = PACKAGED_NAMES[0];
  if (name === undefined) throw new Error("the kernel packages no skills to test against");
  return name;
}

/** Copies every packaged skill's exact bytes into one skill location of the temporary root. */
function installAll(root: string, location: string): void {
  for (const name of PACKAGED_NAMES) cpSync(join(PACKAGED_SKILLS_DIR, name), join(root, location, name), { recursive: true });
}

interface Run {
  readonly status: number | null;
  readonly out: string;
}

function run(root: string): Run {
  const result = spawnSync(process.execPath, [TOOL, "--root", root], { encoding: "utf8", windowsHide: true });
  return { status: result.status, out: result.stdout ?? "" };
}

test(
  "health passes when every installed grace5-* directory matches the packaged bytes, in both locations",
  () => {
    const root = tempRoot();
    for (const location of SKILL_LOCATIONS) installAll(root, location);
    const result = run(root);
    expect(result.out).toContain("state: none");
    expect(result.out).toContain("installed skills: ok");
    expect(result.status).toBe(0);
  },
  TIMEOUT,
);

test(
  "a corrupted installed file fails and names the differing path; restoring the exact bytes passes",
  () => {
    const root = tempRoot();
    installAll(root, ".claude/skills");
    const name = firstName();
    const file = join(root, ".claude", "skills", name, "SKILL.md");
    const original = readFileSync(file);
    writeFileSync(file, Buffer.concat([original, Buffer.from("\ncorrupted\n")]));

    let result = run(root);
    expect(result.out).toContain(`drift: .claude/skills/${name}/SKILL.md`);
    expect(result.out).toContain("installation: drift");
    expect(result.status).toBe(1);

    writeFileSync(file, original);
    result = run(root);
    expect(result.out).toContain("installed skills: ok");
    expect(result.status).toBe(0);
  },
  TIMEOUT,
);

test(
  "a project-owned skill beside the installed ones is ignored",
  () => {
    const root = tempRoot();
    installAll(root, ".agents/skills");
    const projectSkill = join(root, ".agents", "skills", "my-project-skill", "SKILL.md");
    mkdirSync(join(root, ".agents", "skills", "my-project-skill"), { recursive: true });
    writeFileSync(projectSkill, "---\nname: my-project-skill\n---\n\nProject-owned; not packaged.\n");

    const result = run(root);
    expect(result.out).toContain("installed skills: ok");
    expect(result.status).toBe(0);
  },
  TIMEOUT,
);

test(
  "a missing packaged source is an actionable error, not a pass",
  () => {
    const root = tempRoot();
    const missing = join(root, "no-such-packaged-skills");
    const report = installationHealth(root, missing);
    expect(report.lines).toContain(`installation: packaged skills missing: ${missing}`);
    expect(report.code).toBe(1);
  },
  TIMEOUT,
);

test(
  "--help prints usage and exits 0",
  () => {
    const result = spawnSync(process.execPath, [TOOL, "--help"], { encoding: "utf8", windowsHide: true });
    expect(result.stdout ?? "").toContain("usage: bun src/tools/installation-health.ts");
    expect(result.status).toBe(0);
  },
  TIMEOUT,
);
