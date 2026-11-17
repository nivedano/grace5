// Kernel source hygiene (upgrade.md): the skill tree a refresh reads must match HEAD, so a running checkout
// cannot install uncommitted skill text into a governed repository. The kernel reads no project file.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/** The kernel checkout root: this file lives in src/upgrade/. */
export const KERNEL_ROOT = resolve(import.meta.dir, "..", "..");
/** The skill tree the kernel authors and reads: the sole maintained skill source, kernel source and not a project file. The generated packages under packages/ are build outputs and are not read here. */
export const SKILL_SOURCES = ["skills"] as const;

function run(root: string, args: readonly string[]): { ok: boolean; out: string } {
  const result = spawnSync("git", ["-c", "core.quotepath=false", ...args], { cwd: root, windowsHide: true, maxBuffer: 1 << 24 });
  // Porcelain status starts with a space for an unstaged modification; trimming would eat the first path character.
  return { ok: result.status === 0, out: String(result.stdout ?? "") };
}

/**
 * Paths under the kernel's skill sources that differ from HEAD, staged, unstaged or untracked; empty when the kernel
 * root is not its own git worktree. A checkout without `.git` is trusted (upgrade.md).
 */
export function modifiedSkillSources(root = KERNEL_ROOT): string[] {
  if (!existsSync(join(root, ".git"))) return [];
  const result = run(root, ["status", "--porcelain", "-z", "--untracked-files=all", "--", ...SKILL_SOURCES]);
  if (!result.ok) return [];
  const paths = new Set<string>();
  const fields = result.out.split("\0");
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i] ?? "";
    if (field.length < 4) continue;
    const code = field.slice(0, 2);
    paths.add(field.slice(3));
    if (code.includes("R") || code.includes("C")) {
      const from = fields[++i] ?? "";
      if (from !== "") paths.add(from);
    }
  }
  return [...paths].sort();
}
