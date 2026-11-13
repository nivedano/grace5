// Migration steps (upgrade.md): kernel code, one per version boundary whose state layout, local ignore file or skills differ.
// Each step is idempotent and self-verifying; verify throws when the state is not in the step's target shape.
// Each step declares, before anything is written, the change ids whose directories it would write (`touches`), so that
// `upgrade` can refuse while such a change is open. Every path a step writes is kernel-managed (source-identity.md):
// the state directory and the installed skills; no step writes a project file.

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CHANGES_DIR, STATE_DIR } from "../git";
import { changesDir, CLOSED_DIR, closedDir, listChanges } from "../state";
import { PIN_PATH, readPin, writePin } from "./pin";
import { skillDifferences } from "./skills";

export interface Step {
  readonly from: string;
  readonly to: string;
  /** One sentence, printed in the plan. */
  readonly describe: string;
  /** Brings the state to the shape of `to`. Throws with the reason on failure. Applied to state already in shape, it changes nothing. */
  apply(root: string): void;
  /** Throws with the reason when the state is not in the shape of `to`; `packaged` is the packaged skills directory the refresh used, the kernel's own by default. */
  verify(root: string, packaged?: string): void;
  /** The ids, open or closed, of the changes whose directories `apply` would write in this repository. */
  touches(root: string): string[];
}

/** The local ignore file (upgrade.md): keeps the run logs of the open and the closed changes out of git, inside the state directory. */
export const LOCAL_IGNORE_PATH = `${STATE_DIR}.gitignore`;
/** Its two lines, relative to the state directory. */
export const LOCAL_IGNORE_LINES: readonly string[] = ["changes/*/records/logs/", `changes/${CLOSED_DIR}/*/records/logs/`];
/** The file as init and the steps write it when it is absent: the two lines, LF. */
export const LOCAL_IGNORE_TEXT = `${LOCAL_IGNORE_LINES.join("\n")}\n`;

function localIgnoreLines(root: string): string[] {
  const file = join(root, LOCAL_IGNORE_PATH);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split(/\r?\n/).map((line) => line.trim());
}

function missingLocalIgnoreLines(root: string): string[] {
  const present = localIgnoreLines(root);
  return LOCAL_IGNORE_LINES.filter((line) => !present.includes(line));
}

/** Writes the local ignore file: created with the two lines where absent, the lines it lacks appended where it exists; a file that carries both is left alone. */
export function writeLocalIgnore(root: string): void {
  const missing = missingLocalIgnoreLines(root);
  if (missing.length === 0) return;
  const file = join(root, LOCAL_IGNORE_PATH);
  mkdirSync(dirname(file), { recursive: true });
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  const separator = existing === "" || existing.endsWith("\n") ? "" : "\n";
  appendFileSync(file, `${separator}${missing.join("\n")}\n`);
}

function verifyLocalIgnore(root: string): void {
  const missing = missingLocalIgnoreLines(root);
  if (missing.length > 0) throw new Error(`${LOCAL_IGNORE_PATH} lacks the line ${missing.join(", ")}`);
}

function closedSiblings(root: string): string[] {
  return listChanges(root).filter((id) => existsSync(join(changesDir(root), id, "records", "close.xml")));
}

const moveClosed: Step = {
  from: "0.1.0",
  to: "0.2.0",
  describe: `move every closed change (one with records/close.xml) from ${CHANGES_DIR} to ${CHANGES_DIR}${CLOSED_DIR}/, logs included, and write the local ignore file ${LOCAL_IGNORE_PATH}`,
  apply(root) {
    for (const id of closedSiblings(root)) {
      const target = join(closedDir(root), id);
      if (existsSync(target)) throw new Error(`${CHANGES_DIR}${id} and ${CHANGES_DIR}${CLOSED_DIR}/${id} both exist`);
      if (existsSync(closedDir(root)) && !statSync(closedDir(root)).isDirectory()) throw new Error(`${CHANGES_DIR}${CLOSED_DIR} is not a directory`);
      mkdirSync(closedDir(root), { recursive: true });
      renameSync(join(changesDir(root), id), target);
    }
    writeLocalIgnore(root);
  },
  verify(root) {
    const left = closedSiblings(root);
    if (left.length > 0) throw new Error(`closed change still under ${CHANGES_DIR}: ${left.join(", ")}`);
    verifyLocalIgnore(root);
  },
  touches(root) {
    return closedSiblings(root);
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
  touches() {
    return [];
  },
};

const refreshTheSkills: Step = {
  from: "0.3.0",
  to: "0.4.0",
  describe: "refresh the installed skills to 0.4.0",
  apply() {
    // Nothing beyond the skill refresh the runner performs for every step: 0.4.0 changed the skills and nothing else in the state.
  },
  verify(root, packaged) {
    // Compared with the packaged directory the refresh used (review-2 F5 of C-0005-upgrade-with-open-changes).
    const differing = skillDifferences(root, packaged);
    if (differing.length > 0) throw new Error(`installed skill files differ from the packaged ones: ${differing.join(", ")}`);
  },
  touches() {
    return [];
  },
};

const writeTheLocalIgnore: Step = {
  from: "0.4.0",
  to: "0.5.0",
  describe: `write the local ignore file ${LOCAL_IGNORE_PATH}`,
  apply(root) {
    // The run-log ignore lines moved from the project's .gitignore into the state directory; a line an earlier version
    // wrote into the project's .gitignore is left alone, since the kernel writes no project file.
    writeLocalIgnore(root);
  },
  verify(root) {
    verifyLocalIgnore(root);
  },
  touches() {
    return [];
  },
};

/** The steps in version order. A boundary between two versions without a step is a pin bump. */
export const STEPS: readonly Step[] = [moveClosed, writeThePin, refreshTheSkills, writeTheLocalIgnore];

// The packaged skills, their locations and the refresh live in skills.ts; re-exported for the chain runner and the tools.
export { PACKAGED_SKILLS_DIR, SKILL_LOCATIONS, packagedSkillNames, refreshSkills, skillDifferences } from "./skills";
