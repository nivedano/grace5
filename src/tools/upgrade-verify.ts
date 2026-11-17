// Verifies the upgrade on a clone of this repository at the tag of the previous version (CK6 of C-0004-upgrade-command):
// the clone has no pin, so it reads as 0.1.0 and the whole chain runs; afterwards it must carry the kernel's version and
// the local ignore file, list the same changes as closed, report the same contract and definition hashes as before, and
// leave the project's .gitignore byte for byte as it was (CK6 of C-0006-kernel-managed-paths).
// With --with-open-change (CK6 of C-0005-upgrade-with-open-changes) an open change is laid out beside the closed ones
// first and stale prepare/execute skills are installed in both supported locations; the upgrade must retire any old
// orchestrate copies, list the change as open and untouched, and leave its candidate unchanged.
// The hashes before the upgrade are read with the kernel's own reader, because `check` refuses a stale pin.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { kernelVersion } from "../records";
import { snapshot, snapshotDifference } from "../upgrade/chain";
import { PIN_PATH, UNPINNED_VERSION } from "../upgrade/pin";
import { LOCAL_IGNORE_LINES, LOCAL_IGNORE_PATH, PACKAGED_SKILLS_DIR } from "../upgrade/steps";

const ROOT = resolve(import.meta.dir, "..", "..");
const CLI = join(ROOT, "src", "cli.ts");
const TAG = "v0.2.0";
/** The open change laid out in the clone with --with-open-change: a valid contract copied from a worked example, no records. */
const OPEN_CHANGE = "C-0099-open";
const EXAMPLE_CONTRACT = join(ROOT, "models", "architecture", "examples", "A-small-fix", "contract.xml");
/** The stale skill installed in the clone with --with-open-change: a kernel-managed path, so outside the candidate. */
const STALE_SKILL = ".agents/skills/grace5-prepare";
const SECOND_STALE_SKILL = ".claude/skills/grace5-execute";
/** The steps of this kernel's chain from the unpinned state, in order. */
const STEP_LINES = [
  "step: 0.1.0 -> 0.2.0: ",
  "step: 0.2.0 -> 0.3.0: ",
  "step: 0.3.0 -> 0.4.0: refresh the installed skills to 0.4.0",
  `step: 0.4.0 -> 0.5.0: write the local ignore file ${LOCAL_IGNORE_PATH}`,
  "step: 0.5.0 -> 0.6.0: install grace5-orchestrate beside the installed skills and refresh them to 0.6.0",
];

interface Output {
  readonly code: number;
  readonly lines: string[];
  readonly text: string;
}

function git(cwd: string, args: readonly string[]): void {
  const result = spawnSync("git", ["-c", "user.name=upgrade-verify", "-c", "user.email=upgrade-verify@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${(result.stderr ?? "").trim()}`);
}

function kernel(root: string, args: readonly string[]): Output {
  const result = spawnSync(process.execPath, [CLI, "--root", root, ...args], { encoding: "utf8", windowsHide: true, cwd: ROOT });
  const text = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { code: result.status ?? -1, lines: text.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line !== ""), text };
}

/** Lays the open change out as `init <id>` would, which the stale pin of the clone refuses: the directory, its records/ and a contract. */
function layOutOpenChange(clone: string): void {
  const dir = join(clone, ".grace5", "changes", OPEN_CHANGE);
  mkdirSync(join(dir, "records"), { recursive: true });
  const example = readFileSync(EXAMPLE_CONTRACT, "utf8");
  const idAttribute = /<Contract id="([^"]+)"/.exec(example);
  if (idAttribute === null) throw new Error(`${EXAMPLE_CONTRACT} has no Contract id`);
  writeFileSync(join(dir, "contract.xml"), example.replace(`<Contract id="${idAttribute[1] ?? ""}"`, `<Contract id="${OPEN_CHANGE}"`));
}

/** Installs stale packaged skills in both supported locations and commits them, so that the tree itself differs. */
function installStaleSkill(clone: string): void {
  for (const [rel, text] of [
    [STALE_SKILL, "stale text of the prepare skill, installed by an earlier kernel\n"],
    [SECOND_STALE_SKILL, "stale text of the execute skill, installed by an earlier kernel\n"],
  ] as const) {
    const dir = join(clone, rel);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), text);
    git(clone, ["add", "--", rel]);
  }
  git(clone, ["commit", "-q", "-m", `install stale ${STALE_SKILL} and ${SECOND_STALE_SKILL}`]);
}

function candidateLine(root: string, id: string): string | undefined {
  return kernel(root, ["status", id]).lines.find((line) => line.startsWith("candidate: "));
}

function readIfPresent(file: string): string | undefined {
  return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}

async function main(withOpenChange: boolean): Promise<number> {
  const failures: string[] = [];
  const ok = (what: string): void => console.log(`ok ${what}`);
  const fail = (what: string): void => {
    failures.push(what);
    console.log(`difference: ${what}`);
  };
  const tmp = mkdtempSync(join(tmpdir(), "grace5-upgrade-"));
  const clone = join(tmp, "clone");
  try {
    git(ROOT, ["clone", "-q", "--no-local", "-c", "core.autocrlf=false", ROOT, clone]);
    git(clone, ["-c", "advice.detachedHead=false", "checkout", "-q", TAG]);
    ok(`cloned ${TAG}`);
    if (existsSync(join(clone, PIN_PATH))) fail(`${TAG} carries a pin; this tool expects the unpinned state`);
    if (existsSync(join(clone, LOCAL_IGNORE_PATH))) fail(`${TAG} carries ${LOCAL_IGNORE_PATH}; this tool expects it absent`);
    const projectIgnoreBefore = readIfPresent(join(clone, ".gitignore"));
    if (projectIgnoreBefore === undefined) fail(`${TAG} has no .gitignore to compare`);

    let candidateBefore: string | undefined;
    if (withOpenChange) {
      layOutOpenChange(clone);
      candidateBefore = candidateLine(clone, OPEN_CHANGE);
      if (candidateBefore !== undefined && /^candidate: [0-9a-f]{64} \(clean\)$/.test(candidateBefore)) ok(`before: ${OPEN_CHANGE} open, ${candidateBefore}`);
      else fail(`status ${OPEN_CHANGE} before the upgrade printed ${candidateBefore ?? "no candidate line"}, expected a clean candidate`);
      // A stale installed skill, committed: a kernel-managed path, so the candidate must read the same.
      installStaleSkill(clone);
      const withSkill = candidateLine(clone, OPEN_CHANGE);
      if (withSkill === candidateBefore) ok(`${OPEN_CHANGE} candidate unchanged by the committed stale ${STALE_SKILL}`);
      else fail(`${OPEN_CHANGE} candidate changed from ${candidateBefore ?? "none"} to ${withSkill ?? "none"} when the stale ${STALE_SKILL} was committed`);
    }

    const before = await snapshot(clone);
    if (before.size === 0) fail(`no change found in the clone at ${TAG}`);
    for (const [id, state] of before) ok(`before: ${id} contract ${state.contractSha256 ?? "unreadable"}, ${String(state.definitions.size)} definitions, ${String(state.defects.length)} defects`);
    const closedIds = [...before.keys()].filter((id) => id !== OPEN_CHANGE);

    const version = kernelVersion();
    const upgrade = kernel(clone, ["upgrade"]);
    console.log(upgrade.text.trimEnd());
    const expected = `upgraded: ${UNPINNED_VERSION} -> ${version}`;
    if (upgrade.code === 0 && upgrade.lines.includes(expected)) ok(expected);
    else fail(`upgrade exited ${String(upgrade.code)} without the line ${expected}`);
    // The chain of this kernel is five steps and no bump.
    const stepLines = upgrade.lines.filter((line) => line.startsWith("step: "));
    const bumpLines = upgrade.lines.filter((line) => line.startsWith("bump: ")).length;
    const inOrder = stepLines.length === STEP_LINES.length && STEP_LINES.every((prefix, i) => (stepLines[i] ?? "").startsWith(prefix));
    if (inOrder && bumpLines === 0) ok("plan: five steps ending with the skill refresh, no bump");
    else fail(`plan has ${String(stepLines.length)} step and ${String(bumpLines)} bump lines, expected the five steps ending with the skill refresh: ${stepLines.join(" | ")}`);
    if (upgrade.lines.some((line) => line.startsWith("writes:") || line.startsWith("evidence of open changes"))) fail("upgrade printed a writes: or evidence line; neither exists");
    const skillsLines = upgrade.lines.filter((line) => line === "skills: none installed").length;
    const refreshedLines = upgrade.lines.filter((line) => line === `refreshed: ${STALE_SKILL}`).length;
    if (withOpenChange) {
      if (refreshedLines === stepLines.length && skillsLines === 0) ok(`refreshed: ${STALE_SKILL} once per step (${String(refreshedLines)})`);
      else fail(`expected refreshed: ${STALE_SKILL} ${String(stepLines.length)} times and no skills: none installed line, got ${String(refreshedLines)} and ${String(skillsLines)}`);
      const secondRefreshed = upgrade.lines.filter((line) => line === `refreshed: ${SECOND_STALE_SKILL}`).length;
      if (secondRefreshed === stepLines.length) ok(`refreshed: ${SECOND_STALE_SKILL} once per step (${String(secondRefreshed)})`);
      else fail(`expected refreshed: ${SECOND_STALE_SKILL} ${String(stepLines.length)} times, got ${String(secondRefreshed)}`);
      const installed = readIfPresent(join(clone, STALE_SKILL, "SKILL.md"));
      const packaged = readFileSync(join(PACKAGED_SKILLS_DIR, "grace5-prepare", "SKILL.md"), "utf8");
      if (installed === packaged) ok(`${STALE_SKILL}/SKILL.md equals the packaged skill`);
      else fail(`${STALE_SKILL}/SKILL.md differs from the packaged skill after the upgrade`);
      const untouched = `open, untouched: ${OPEN_CHANGE}`;
      if (upgrade.lines.includes(untouched)) ok(untouched);
      else fail(`upgrade did not print ${untouched}`);
      if (upgrade.lines.includes(`checked: ${OPEN_CHANGE}`)) ok(`checked: ${OPEN_CHANGE}`);
      else fail(`upgrade did not print checked: ${OPEN_CHANGE}`);
    } else if (skillsLines === stepLines.length && !upgrade.lines.some((line) => line.startsWith("refreshed:"))) ok(`skills: none installed once per step (${String(skillsLines)})`);
    else fail(`expected skills: none installed ${String(stepLines.length)} times and no refreshed: line, got ${String(skillsLines)}`);

    for (const location of [".agents/skills", ".claude/skills"]) {
      const orchestrate = join(clone, location, "grace5-orchestrate");
      if (!existsSync(orchestrate)) ok(`${location}/grace5-orchestrate absent after upgrade`);
      else fail(`${location}/grace5-orchestrate remains after upgrade`);
    }

    const pinFile = join(clone, PIN_PATH);
    const pin = readIfPresent(pinFile);
    if (pin === `${version}\n`) ok(`pin ${PIN_PATH} reads ${version}`);
    else fail(`pin reads ${JSON.stringify(pin ?? "nothing")}, expected ${JSON.stringify(`${version}\n`)}`);

    const localIgnore = (readIfPresent(join(clone, LOCAL_IGNORE_PATH)) ?? "").split(/\r?\n/).map((line) => line.trim());
    const missing = LOCAL_IGNORE_LINES.filter((line) => !localIgnore.includes(line));
    if (missing.length === 0) ok(`${LOCAL_IGNORE_PATH} carries ${LOCAL_IGNORE_LINES.join(" and ")}`);
    else fail(`${LOCAL_IGNORE_PATH} lacks ${missing.join(", ")}`);
    const projectIgnoreAfter = readIfPresent(join(clone, ".gitignore"));
    if (projectIgnoreAfter === projectIgnoreBefore) ok(".gitignore of the project is byte for byte as before");
    else fail(".gitignore of the project changed; the kernel writes no project file");

    const status = kernel(clone, ["status", "--all"]);
    if (status.code !== 0) fail(`status --all exited ${String(status.code)}: ${status.text}`);
    for (const id of closedIds) {
      if (status.lines.includes(`${id}: closed`)) ok(`status lists ${id} as closed`);
      else fail(`status does not list ${id} as closed`);
    }
    if (withOpenChange) {
      if (status.lines.some((line) => line.startsWith(`${OPEN_CHANGE}: unapproved, next: `))) ok(`status lists ${OPEN_CHANGE} as open`);
      else fail(`status does not list ${OPEN_CHANGE} as an open change`);
      if (existsSync(join(clone, ".grace5", "changes", OPEN_CHANGE, "records", "close.xml"))) fail(`${OPEN_CHANGE} carries a close record after the upgrade`);
      else ok(`${OPEN_CHANGE} still open under .grace5/changes/`);
      const candidateAfter = candidateLine(clone, OPEN_CHANGE);
      if (candidateAfter === candidateBefore) ok(`${OPEN_CHANGE} candidate unchanged: ${candidateAfter ?? ""}`);
      else fail(`${OPEN_CHANGE} candidate changed from ${candidateBefore ?? "none"} to ${candidateAfter ?? "none"}`);
    }
    const stray = status.lines.filter((line) => /^C-[0-9]{4}/.test(line) && !before.has(line.split(":")[0] ?? ""));
    for (const line of stray) fail(`status lists a change that was not there before: ${line}`);
    const counted = `closed changes: ${String(closedIds.length)}`;
    if (status.lines.at(-1) === counted) ok(counted);
    else fail(`status ends with ${status.lines.at(-1) ?? "nothing"}, expected ${counted}`);
    const kernelLine = `kernel: ${version}, state: ${version}`;
    if (status.lines[0] === kernelLine) ok(kernelLine);
    else fail(`status starts with ${status.lines[0] ?? "nothing"}, expected ${kernelLine}`);

    const after = await snapshot(clone);
    const difference = snapshotDifference(before, after);
    if (difference === undefined) ok(`hashes and defects of ${String(before.size)} changes unchanged`);
    else fail(difference);

    const again = kernel(clone, ["upgrade"]);
    if (again.code === 0 && again.lines.includes(`up to date: ${version}`)) ok(`second upgrade: up to date: ${version}`);
    else fail(`second upgrade exited ${String(again.code)}: ${again.text}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
  if (failures.length > 0) console.log(`failed: ${String(failures.length)} difference(s)`);
  return failures.length === 0 ? 0 : 1;
}

try {
  const args = process.argv.slice(2);
  const unknown = args.find((arg) => arg !== "--with-open-change");
  if (unknown !== undefined) throw new Error(`unknown argument ${unknown}; the only flag is --with-open-change`);
  process.exitCode = await main(args.includes("--with-open-change"));
} catch (error) {
  console.error(`upgrade-verify: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
