// Installation health (upgrade.md, source-identity.md): the installed grace5-* skill directories under
// .agents/skills/ and .claude/skills/ are package-owned and kernel-managed, so the refresh of a step is
// their only writer and a required check that depends on their bytes is not candidate evidence. This tool
// reads the pin and compares every installed grace5-* directory with the kernel's packaged skills: it
// reports each differing path and a nonzero status on drift, treats a missing packaged source as an
// actionable error rather than a pass, and writes nothing.

import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { kernelVersion } from "../records";
import { readPin } from "../upgrade/pin";
import { PACKAGED_SKILLS_DIR, SKILL_LOCATIONS, packagedSkillNames, skillDifferences } from "../upgrade/skills";

const USAGE = `usage: bun src/tools/installation-health.ts [--root <dir>] [--help]

Reports the kernel version, the state pin and whether every installed grace5-* skill directory
under .agents/skills/ or .claude/skills/ matches the kernel's packaged skills. It reads only and
writes nothing; drift is reported, never repaired.

Options:
  --root <dir>   The repository root that holds .grace5/ and the installed skills. Defaults to the
                 current directory.
  --help, -h     Show this help.

Output:
  kernel: <version>
  state: <pin> | none | unreadable (<reason>)
  drift: <path>                        one line per installed file that differs from the packaged one
  installation: drift                  exit status 1
  installation: packaged skills missing: <path>   exit status 1
  installed skills: ok | none          exit status 0

Exit status:
  0  the installation matches, or no package-owned skill is installed
  1  drift, a missing packaged source, or an unreadable pin
  2  a usage error`;

export interface Health {
  /** The report lines, in order. */
  readonly lines: readonly string[];
  /** 0 when the installation is healthy, 1 on drift or a missing packaged source. */
  readonly code: number;
}

/** The installed grace5-* directories a packaged source names: `<location>/<name>` for each existing one. */
function installedDirs(root: string, names: readonly string[]): string[] {
  const found: string[] = [];
  for (const location of SKILL_LOCATIONS) {
    for (const name of names) {
      const dir = join(root, location, name);
      if (existsSync(dir) && statSync(dir).isDirectory()) found.push(`${location}/${name}`);
    }
  }
  return found;
}

/**
 * The installation-health report for one root: the kernel version, the pin, and the comparison of every
 * installed grace5-* directory with the packaged skills. Reads the file system only.
 */
export function installationHealth(root: string, packaged: string = PACKAGED_SKILLS_DIR): Health {
  const lines = [`kernel: ${kernelVersion()}`];
  let pin: string | undefined;
  try {
    pin = readPin(root);
  } catch (error) {
    lines.push(`state: unreadable (${error instanceof Error ? error.message : String(error)})`);
    return { lines, code: 1 };
  }
  lines.push(`state: ${pin ?? "none"}`);
  if (!existsSync(packaged)) {
    lines.push(`installation: packaged skills missing: ${packaged}`);
    return { lines, code: 1 };
  }
  const drift = skillDifferences(root, packaged);
  if (drift.length > 0) {
    for (const path of drift) lines.push(`drift: ${path}`);
    lines.push("installation: drift");
    return { lines, code: 1 };
  }
  const installed = installedDirs(root, packagedSkillNames(packaged));
  lines.push(installed.length === 0 ? "installed skills: none" : "installed skills: ok");
  return { lines, code: 0 };
}

function main(argv: readonly string[]): number {
  let root = process.cwd();
  const rest = [...argv];
  while (rest.length > 0) {
    const arg = rest.shift();
    if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      return 0;
    }
    if (arg === "--root") {
      const value = rest.shift();
      if (value === undefined) {
        console.error(`${USAGE.split("\n")[0] ?? ""} (--root needs a directory)`);
        return 2;
      }
      root = resolve(value);
      continue;
    }
    console.error(`${USAGE.split("\n")[0] ?? ""} (unknown argument: ${String(arg)})`);
    return 2;
  }
  const report = installationHealth(root);
  for (const line of report.lines) console.log(line);
  return report.code;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
