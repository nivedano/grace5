// Source identity (source-identity.md) through git subprocesses. Read-only: the kernel never stages, commits, stashes or moves anything.

import { spawnSync } from "node:child_process";
import { sha256Hex } from "./contract";
import { packagedSkillNames, RETIRED_SKILLS, SKILL_LOCATIONS } from "./upgrade/skills";

/** The state directory: everything under it is kernel-managed (source-identity.md). */
export const STATE_DIR = ".grace5/";
export const CHANGES_DIR = `${STATE_DIR}changes/`;

export interface Git {
  readonly root: string;
  /** Path of `root` inside the repository, empty or ending in `/`. */
  readonly prefix: string;
}

function run(root: string, args: readonly string[]): { ok: boolean; out: Buffer; err: string } {
  const result = spawnSync("git", ["-c", "core.quotepath=false", ...args], { cwd: root, windowsHide: true, maxBuffer: 1 << 30 });
  return { ok: result.status === 0, out: result.stdout ?? Buffer.alloc(0), err: String(result.stderr ?? result.error ?? "").trim() };
}

/** Undefined when `root` is not inside a git work tree. */
export function openGit(root: string): Git | undefined {
  const result = run(root, ["rev-parse", "--show-prefix"]);
  if (!result.ok) return undefined;
  return { root, prefix: result.out.toString("utf8").trim() };
}

/** The commit HEAD names, or undefined before the first commit. */
export function headRevision(git: Git): string | undefined {
  const result = run(git.root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  const revision = result.out.toString("utf8").trim();
  return result.ok && /^[0-9a-f]{40}$/.test(revision) ? revision : undefined;
}

let managedPrefixes: readonly string[] | undefined;

/**
 * The kernel-managed path prefixes (source-identity.md): the whole state directory and, under each skill location, the
 * directories named by the packaged and retired skills, read once per process. A repository's own skill beside them is source.
 */
function kernelManagedPrefixes(): readonly string[] {
  if (managedPrefixes === undefined) {
    const names = [...new Set([...packagedSkillNames(), ...RETIRED_SKILLS])];
    managedPrefixes = [STATE_DIR, ...SKILL_LOCATIONS.flatMap((location) => names.map((name) => `${location}/${name}/`))];
  }
  return managedPrefixes;
}

/** Source (source-identity.md): every tracked path except the kernel-managed ones, matched by exact path prefix. */
function isSource(git: Git, repoPath: string): boolean {
  return !kernelManagedPrefixes().some((prefix) => repoPath.startsWith(git.prefix + prefix));
}

/** Strips the root's prefix, so paths read relative to the kernel's root; a path outside it keeps a leading `../`. */
function relative(git: Git, repoPath: string): string {
  if (git.prefix === "") return repoPath;
  return repoPath.startsWith(git.prefix) ? repoPath.slice(git.prefix.length) : `${git.prefix.replace(/[^/]+\//g, "../")}${repoPath}`;
}

const candidates = new Map<string, string>();

/** SHA-256 of the lines `<mode> <object> <path>`, sorted by the bytes of the path, the kernel-managed paths removed. */
export function candidateOf(git: Git, revision: string): string | undefined {
  const key = `${git.root}\0${revision}`;
  const known = candidates.get(key);
  if (known !== undefined) return known;
  const result = run(git.root, ["ls-tree", "-r", "-z", "--full-tree", revision]);
  if (!result.ok) return undefined;
  const entries: { path: Buffer; line: Buffer }[] = [];
  let start = 0;
  const out = result.out;
  while (start < out.length) {
    let end = out.indexOf(0, start);
    if (end < 0) end = out.length;
    const tab = out.indexOf(9, start);
    if (tab > start && tab < end) {
      const [mode, , object] = out.subarray(start, tab).toString("latin1").split(" ");
      const path = out.subarray(tab + 1, end);
      if (isSource(git, path.toString("utf8"))) {
        entries.push({ path, line: Buffer.concat([Buffer.from(`${mode ?? ""} ${object ?? ""} `, "latin1"), path, Buffer.from("\n")]) });
      }
    }
    start = end + 1;
  }
  entries.sort((a, b) => Buffer.compare(a.path, b.path));
  const candidate = sha256Hex(Buffer.concat(entries.map((entry) => entry.line)));
  candidates.set(key, candidate);
  return candidate;
}

/** Dirty source paths: everything `git status --porcelain` lists outside the kernel-managed paths, untracked files included. */
export function dirtyPaths(git: Git): string[] {
  // --untracked-files=all, because a collapsed `?? .grace5/` would hide whether a source path is inside.
  const result = run(git.root, ["status", "--porcelain", "-z", "--untracked-files=all"]);
  if (!result.ok) return [];
  const fields = result.out.toString("utf8").split("\0");
  const paths = new Set<string>();
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i] ?? "";
    if (field.length < 4) continue;
    const code = field.slice(0, 2);
    const names = [field.slice(3)];
    // A rename or copy carries its origin as the next field.
    if (code.includes("R") || code.includes("C")) names.push(fields[++i] ?? "");
    for (const name of names) if (name !== "" && isSource(git, name)) paths.add(relative(git, name));
  }
  return [...paths].sort();
}

/** Source paths that differ between two revisions (the net difference of the two trees). */
export function changedBetween(git: Git, start: string, end: string): string[] | undefined {
  const result = run(git.root, ["diff", "--name-only", "-z", "--no-renames", start, end]);
  if (!result.ok) return undefined;
  return result.out.toString("utf8").split("\0").filter((path) => path !== "" && isSource(git, path)).map((path) => relative(git, path)).sort();
}

/** HEAD and its ancestors, newest first, while they carry the given candidate (trace-provenance.md, `@revision`). */
export function revisionsWithCandidate(git: Git, revision: string, candidate: string, limit = 200): string[] {
  const result = run(git.root, ["rev-list", `--max-count=${String(limit)}`, revision]);
  if (!result.ok) return [revision];
  const same: string[] = [];
  for (const commit of result.out.toString("utf8").split("\n").map((line) => line.trim()).filter((line) => line !== "")) {
    if (commit !== revision && candidateOf(git, commit) !== candidate) continue;
    same.push(commit);
  }
  return same.length === 0 ? [revision] : same;
}
