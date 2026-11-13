// Migration steps (upgrade.md): kernel code, one per version boundary whose state layout, ignore lines or skills differ.
// Each step is idempotent and self-verifying; verify throws when the state is not in the step's target shape.

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CHANGES_DIR } from "../git";
import { changesDir, CLOSED_DIR, closedDir, listChanges } from "../state";
import { PIN_PATH, readPin, writePin } from "./pin";

export interface Step {
  readonly from: string;
  readonly to: string;
  /** One sentence, printed in the plan. */
  readonly describe: string;
  /** Brings the state to the shape of `to`. Throws with the reason on failure. Applied to state already in shape, it changes nothing. */
  apply(root: string): void;
  /** Throws with the reason when the state is not in the shape of `to`. */
  verify(root: string): void;
}

/** The ignore line the 0.1.0 to 0.2.0 step appends: the logs of moved changes stay local like those of the open ones. */
export const CLOSED_LOGS_IGNORE = `${CHANGES_DIR}${CLOSED_DIR}/*/records/logs/`;

function closedSiblings(root: string): string[] {
  return listChanges(root).filter((id) => existsSync(join(changesDir(root), id, "records", "close.xml")));
}

function ignoreLines(root: string): string[] {
  const file = join(root, ".gitignore");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split(/\r?\n/).map((line) => line.trim());
}

const moveClosed: Step = {
  from: "0.1.0",
  to: "0.2.0",
  describe: `move every closed change (one with records/close.xml) from ${CHANGES_DIR} to ${CHANGES_DIR}${CLOSED_DIR}/, logs included, and ignore ${CLOSED_LOGS_IGNORE} in .gitignore`,
  apply(root) {
    for (const id of closedSiblings(root)) {
      const target = join(closedDir(root), id);
      if (existsSync(target)) throw new Error(`${CHANGES_DIR}${id} and ${CHANGES_DIR}${CLOSED_DIR}/${id} both exist`);
      if (existsSync(closedDir(root)) && !statSync(closedDir(root)).isDirectory()) throw new Error(`${CHANGES_DIR}${CLOSED_DIR} is not a directory`);
      mkdirSync(closedDir(root), { recursive: true });
      renameSync(join(changesDir(root), id), target);
    }
    if (!ignoreLines(root).includes(CLOSED_LOGS_IGNORE)) {
      const file = join(root, ".gitignore");
      const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
      const separator = existing === "" || existing.endsWith("\n") ? "" : "\n";
      appendFileSync(file, `${separator}${CLOSED_LOGS_IGNORE}\n`);
    }
  },
  verify(root) {
    const left = closedSiblings(root);
    if (left.length > 0) throw new Error(`closed change still under ${CHANGES_DIR}: ${left.join(", ")}`);
    if (!ignoreLines(root).includes(CLOSED_LOGS_IGNORE)) throw new Error(`.gitignore lacks the line ${CLOSED_LOGS_IGNORE}`);
  },
};

const writeThePin: Step = {
  from: "0.2.0",
  to: "0.3.0",
  describe: `write the version pin ${PIN_PATH}`,
  apply(root) {
    writePin(root, "0.3.0");
  },
  verify(root) {
    const pin = readPin(root);
    if (pin !== "0.3.0") throw new Error(`${PIN_PATH} reads ${pin ?? "nothing"}, expected 0.3.0`);
  },
};

/** The steps in version order. A boundary between two versions without a step is a pin bump. */
export const STEPS: readonly Step[] = [moveClosed, writeThePin];

// ---------------------------------------------------------------- skills

/** The kernel's packaged skills: packages/skills/<name>/ of this source tree. */
export const PACKAGED_SKILLS_DIR = resolve(import.meta.dir, "..", "..", "packages", "skills");
/** Where a repository may already hold the skills; no other location is ever created. */
export const SKILL_LOCATIONS = [".agents/skills", ".claude/skills"] as const;

function listFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string, prefix: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(current, entry.name), rel);
      else found.push(rel);
    }
  };
  walk(dir, "");
  return found;
}

/** The names of the skills the kernel packages (grace5-*). */
export function packagedSkillNames(packaged = PACKAGED_SKILLS_DIR): string[] {
  if (!existsSync(packaged)) throw new Error(`the packaged skills of the kernel are missing: ${packaged}`);
  return readdirSync(packaged, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("grace5-") && existsSync(join(packaged, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
}

/** Mirrors the packaged files into an existing skill directory: every packaged file written, every other file removed. */
function mirror(source: string, target: string): void {
  const wanted = new Set(listFiles(source));
  for (const rel of listFiles(target)) if (!wanted.has(rel)) rmSync(join(target, rel));
  for (const rel of wanted) {
    const file = join(target, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, readFileSync(join(source, rel)));
  }
}

/**
 * Refreshes the grace5-* skill directories wherever they already exist under .agents/skills/ or .claude/skills/, from the
 * packaged skills, and returns their paths relative to the root. Creates no new location; a grace5-* directory the kernel
 * does not package is left alone.
 */
export function refreshSkills(root: string, packaged = PACKAGED_SKILLS_DIR): string[] {
  const refreshed: string[] = [];
  const names = packagedSkillNames(packaged);
  for (const location of SKILL_LOCATIONS) {
    for (const name of names) {
      const target = join(root, location, name);
      if (!existsSync(target) || !statSync(target).isDirectory()) continue;
      mirror(join(packaged, name), target);
      refreshed.push(`${location}/${name}`);
    }
  }
  return refreshed;
}
