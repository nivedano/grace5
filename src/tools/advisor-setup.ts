// Advisor guidance setup (models/architecture/advisor-guidance.md): the explicit action that installs
// or refreshes the project-owned root `WATCHDOG.md` import which loads the packaged advisor guidance
// resource. It preserves every existing byte of project guidance, adds at most one intended import
// line, writes `.grace5/advisor-guidance.md` in a client and no other project file, and is idempotent.
// It is a repository tool, not a kernel command, and it adds no runtime advisor dependency.

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** The kernel package root: this file lives in src/tools/. */
const KERNEL_ROOT = resolve(import.meta.dir, "..", "..");
/** The maintained resource, relative to a kernel package or a source checkout. */
const GUIDANCE_REL = "models/architecture/advisor-guidance.md";
/** Where the resource ships in a generated distribution, relative to the package root. */
const PACKAGED_GUIDANCE_REL = "advisor-guidance.md";
/** The resource candidates a client's kernel package may hold, in order of preference. */
const RESOURCE_CANDIDATES = [GUIDANCE_REL, PACKAGED_GUIDANCE_REL] as const;
/** The import a source checkout uses: the maintained resource beside the watchdog. */
const SOURCE_IMPORT = `@${GUIDANCE_REL}`;
/** The import a client uses: the resource copied under `.grace5/`. */
const CLIENT_IMPORT = "@.grace5/advisor-guidance.md";
/** The copied resource file name under `.grace5/`. */
const CLIENT_RESOURCE = "advisor-guidance.md";
/** The header of a watchdog the tool creates. */
const HEADER = "# Advisor watchdog\n\n";

const USAGE = `usage: bun src/tools/advisor-setup.ts [--root <dir>] [--help]

Installs or refreshes the project-owned root WATCHDOG.md import that loads the packaged advisor
guidance resource. Existing WATCHDOG.md content is preserved and at most one intended import line is
added, so a repeated run changes nothing. In a source checkout it imports the maintained
\`${GUIDANCE_REL}\` directly; in a client it copies the packaged resource to \`.grace5/${CLIENT_RESOURCE}\`
and imports that. It writes no other project file and adds no runtime advisor dependency.

Options:
  --root <dir>   The repository root that holds .grace5/. Defaults to the current directory.
  --help, -h     Show this help.

Output:
  watchdog: <path>    the project watchdog the import was ensured in
  import: <line>      the import line the watchdog now carries

Exit status:
  0  the watchdog carries the intended import
  1  .grace5/ is missing, or the packaged resource cannot be found
  2  a usage error`;

export interface Setup {
  /** The report lines, in order. */
  readonly lines: readonly string[];
  /** 0 when the watchdog is in place, 1 on a missing repository or resource. */
  readonly code: number;
}

/** Ensures the file exists and carries exactly one `importLine`, preserving every other byte. */
function ensureImport(path: string, importLine: string): void {
  if (!existsSync(path)) {
    writeFileSync(path, `${HEADER}${importLine}\n`);
    return;
  }
  const text = readFileSync(path, "utf8");
  // Strip a trailing carriage return per line so a CRLF file matches an import written with LF.
  const lines = text.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  const occurrences = lines.filter((line) => line === importLine).length;
  if (occurrences === 1) return;
  if (occurrences === 0) {
    const base = text === "" || text.endsWith("\n") ? text : `${text}\n`;
    writeFileSync(path, `${base}${importLine}\n`);
    return;
  }
  let kept = false;
  const deduped = lines.filter((line) => {
    if (line !== importLine) return true;
    if (kept) return false;
    kept = true;
    return true;
  });
  writeFileSync(path, deduped.join("\n"));
}

/**
 * Installs or refreshes the root `WATCHDOG.md` import for one repository. Reads the file system and
 * writes only `<root>/WATCHDOG.md` and, in a client, `<root>/.grace5/advisor-guidance.md`.
 */
export function advisorSetup(root: string, kernelRoot: string = KERNEL_ROOT): Setup {
  const grace5 = join(root, ".grace5");
  if (!existsSync(grace5) || !statSync(grace5).isDirectory()) {
    return { lines: [`watchdog: not a GRACE repository: ${grace5} does not exist: run grace5 init`], code: 1 };
  }
  let importLine: string;
  if (existsSync(join(root, GUIDANCE_REL))) {
    importLine = SOURCE_IMPORT;
  } else {
    const candidates = RESOURCE_CANDIDATES.map((rel) => join(kernelRoot, rel));
    const resource = candidates.find((path) => existsSync(path));
    if (resource === undefined) {
      return { lines: [`watchdog: advisor guidance resource not found: ${candidates.join(", ")}: reinstall the kernel package`], code: 1 };
    }
    const target = join(grace5, CLIENT_RESOURCE);
    const bytes = readFileSync(resource);
    if (!existsSync(target) || !readFileSync(target).equals(bytes)) writeFileSync(target, bytes);
    importLine = CLIENT_IMPORT;
  }
  const watchdog = join(root, "WATCHDOG.md");
  ensureImport(watchdog, importLine);
  return { lines: [`watchdog: ${watchdog}`, `import: ${importLine}`], code: 0 };
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
  const report = advisorSetup(root);
  const sink = report.code === 0 ? console.log : console.error;
  for (const line of report.lines) sink(line);
  return report.code;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
