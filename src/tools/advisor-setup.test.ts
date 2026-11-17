// Conformance cases CK2 of C-0015-advisor-guidance for the advisor-setup tool
// (models/architecture/advisor-guidance.md): a fresh client install writes one intended import and
// copies the resource; an existing WATCHDOG.md keeps its exact bytes and gains one import; a repeated
// run changes nothing; a source checkout imports the maintained resource in place; a missing .grace5/
// and a missing packaged resource are actionable errors rather than passes. Every root is a throwaway
// directory; this repository's own WATCHDOG.md is never read.

import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { advisorSetup } from "./advisor-setup";

const TOOL = resolve(import.meta.dir, "advisor-setup.ts");
const CLIENT_IMPORT = "@.grace5/advisor-guidance.md";
const SOURCE_IMPORT = "@models/architecture/advisor-guidance.md";
const TIMEOUT = 60_000;

const TEMP_DIRS: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "grace5-advisor-"));
  TEMP_DIRS.push(dir);
  return dir;
}

/** A throwaway root that looks like a client: it holds .grace5/ and nothing else. */
function clientRoot(): string {
  const root = tempRoot();
  mkdirSync(join(root, ".grace5"), { recursive: true });
  return root;
}

afterAll(() => {
  for (const dir of TEMP_DIRS) rmSync(dir, { recursive: true, force: true });
});

interface Run {
  readonly status: number | null;
  readonly out: string;
  readonly err: string;
}

function run(args: readonly string[]): Run {
  const result = spawnSync(process.execPath, [TOOL, ...args], { encoding: "utf8", windowsHide: true });
  return { status: result.status, out: result.stdout ?? "", err: result.stderr ?? "" };
}

test(
  "a fresh client install writes one intended import and copies the resource",
  () => {
    const root = clientRoot();
    const result = run(["--root", root]);
    expect(result.status).toBe(0);
    expect(result.out).toContain(`import: ${CLIENT_IMPORT}`);
    const watchdog = readFileSync(join(root, "WATCHDOG.md"), "utf8").split("\n");
    expect(watchdog.filter((line) => line === CLIENT_IMPORT)).toHaveLength(1);
    expect(existsSync(join(root, ".grace5", "advisor-guidance.md"))).toBe(true);
  },
  TIMEOUT,
);

test(
  "an existing WATCHDOG.md keeps its exact bytes and gains one import",
  () => {
    const root = clientRoot();
    const custom = "# Review priorities\n\n- Watch the queue in src/jobs/.\n";
    writeFileSync(join(root, "WATCHDOG.md"), custom);
    const result = run(["--root", root]);
    expect(result.status).toBe(0);
    expect(readFileSync(join(root, "WATCHDOG.md"), "utf8")).toBe(`${custom}${CLIENT_IMPORT}\n`);
  },
  TIMEOUT,
);

test(
  "a repeated setup changes nothing",
  () => {
    const root = clientRoot();
    run(["--root", root]);
    const watchdog = readFileSync(join(root, "WATCHDOG.md"));
    const resource = readFileSync(join(root, ".grace5", "advisor-guidance.md"));
    const result = run(["--root", root]);
    expect(result.status).toBe(0);
    expect(readFileSync(join(root, "WATCHDOG.md")).equals(watchdog)).toBe(true);
    expect(readFileSync(join(root, ".grace5", "advisor-guidance.md")).equals(resource)).toBe(true);
  },
  TIMEOUT,
);

test(
  "a missing .grace5/ is an actionable error, not a pass",
  () => {
    const root = tempRoot();
    const result = run(["--root", root]);
    expect(result.status).toBe(1);
    expect(result.err).toContain(".grace5");
    expect(existsSync(join(root, "WATCHDOG.md"))).toBe(false);
  },
  TIMEOUT,
);

test(
  "a source checkout imports the maintained resource in place",
  () => {
    const root = clientRoot();
    mkdirSync(join(root, "models", "architecture"), { recursive: true });
    writeFileSync(join(root, "models", "architecture", "advisor-guidance.md"), "# Priorities\n");
    const result = run(["--root", root]);
    expect(result.status).toBe(0);
    expect(result.out).toContain(`import: ${SOURCE_IMPORT}`);
    const watchdog = readFileSync(join(root, "WATCHDOG.md"), "utf8").split("\n");
    expect(watchdog.filter((line) => line === SOURCE_IMPORT)).toHaveLength(1);
    expect(existsSync(join(root, ".grace5", "advisor-guidance.md"))).toBe(false);
  },
  TIMEOUT,
);

test(
  "a missing packaged resource is an actionable error, not a pass",
  () => {
    const root = clientRoot();
    const report = advisorSetup(root, tempRoot());
    expect(report.code).toBe(1);
    expect(report.lines.join("\n")).toContain("advisor guidance resource not found");
  },
  TIMEOUT,
);

test(
  "--help prints usage and exits 0",
  () => {
    const result = run(["--help"]);
    expect(result.status).toBe(0);
    expect(result.out).toContain("usage: bun src/tools/advisor-setup.ts");
  },
  TIMEOUT,
);
