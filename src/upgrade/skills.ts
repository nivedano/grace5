// The packaged skills (upgrade.md): where a repository may hold the grace5-* skill directories, which names the kernel
// packages, and the refresh that mirrors each installed directory from the package. The installed directories are
// kernel-managed paths (source-identity.md): git.ts excludes them from the candidate, the dirty state and the diff.
// This module reads the file system only, so that git.ts can import it without a cycle.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** The kernel's packaged skills: skills/<name>/, the sole maintained skill source of this source tree and of the installed distribution (the package's `files` ships `skills/`). */
export const PACKAGED_SKILLS_DIR = resolve(import.meta.dir, "..", "..", "skills");
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

/** The installed grace5-* skill directories the refresh would mirror: `<location>/<name>` with the packaged source. */
function installedSkills(root: string, packaged: string): { readonly rel: string; readonly source: string; readonly target: string }[] {
  const found: { rel: string; source: string; target: string }[] = [];
  for (const location of SKILL_LOCATIONS) {
    for (const name of packagedSkillNames(packaged)) {
      const target = join(root, location, name);
      if (!existsSync(target) || !statSync(target).isDirectory()) continue;
      found.push({ rel: `${location}/${name}`, source: join(packaged, name), target });
    }
  }
  return found;
}

const ORCHESTRATE_SKILL = "grace5-orchestrate";

/** The orchestrator directories missing beside an installed packaged skill; no new skill location qualifies. */
export function missingOrchestrateSkills(root: string, packaged = PACKAGED_SKILLS_DIR): string[] {
  const installed = new Set(installedSkills(root, packaged).map((skill) => skill.rel));
  return SKILL_LOCATIONS
    .filter((location) => [...installed].some((rel) => rel.startsWith(`${location}/`)) && !installed.has(`${location}/${ORCHESTRATE_SKILL}`))
    .map((location) => `${location}/${ORCHESTRATE_SKILL}`);
}

/** Opens only the missing orchestrator directories; the chain's ordinary refresh mirrors their packaged files. */
export function installOrchestrateSkill(root: string, packaged = PACKAGED_SKILLS_DIR): void {
  if (!packagedSkillNames(packaged).includes(ORCHESTRATE_SKILL)) throw new Error(`the packaged skill is missing: ${ORCHESTRATE_SKILL}`);
  for (const rel of missingOrchestrateSkills(root, packaged)) mkdirSync(join(root, rel), { recursive: true });
}

/** The files of one installed skill directory the mirror would write or remove: a file whose bytes differ, is missing, or is not packaged. */
function mirrorDifference(source: string, target: string): string[] {
  const wanted = new Set(listFiles(source));
  const present = new Set(listFiles(target));
  const differing: string[] = [];
  for (const rel of present) if (!wanted.has(rel)) differing.push(rel);
  for (const rel of wanted) {
    if (!present.has(rel) || !readFileSync(join(source, rel)).equals(readFileSync(join(target, rel)))) differing.push(rel);
  }
  return differing;
}

/** The installed skill files, relative to the root, whose bytes differ from the packaged ones; empty where the skills already match or none is installed. */
export function skillDifferences(root: string, packaged = PACKAGED_SKILLS_DIR): string[] {
  const paths: string[] = [];
  for (const skill of installedSkills(root, packaged)) for (const rel of mirrorDifference(skill.source, skill.target)) paths.push(`${skill.rel}/${rel}`);
  return paths.sort();
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
  for (const skill of installedSkills(root, packaged)) {
    mirror(skill.source, skill.target);
    refreshed.push(skill.rel);
  }
  return refreshed;
}
