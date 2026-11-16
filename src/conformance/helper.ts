// Black-box fixtures for the GRACE 5 conformance suite.
// Everything here is built from the documents under models/architecture/ only:
// the kernel is driven as a subprocess and its records are read as text.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { expect } from "bun:test";
import { type Step } from "../upgrade/steps";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const REPO_ROOT = path.resolve(import.meta.dir, "..", "..");
export const CLI = path.join(REPO_ROOT, "src", "cli.ts");
export const ARCH = path.join(REPO_ROOT, "models", "architecture");
export const TEST_TIMEOUT = 180_000;

export const HEX64 = /^[0-9a-f]{64}$/;
export const HEX40 = /^[0-9a-f]{40}$/;
export const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

// ---------------------------------------------------------------- text tools

export function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function xmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function xmlUnescape(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#10;/g, "\n")
    .replace(/&#xA;/gi, "\n")
    .replace(/&amp;/g, "&");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Opening tags of every element with this name, in document order. */
export function openTags(xml: string, element: string): string[] {
  const re = new RegExp(`<${escapeRegExp(element)}(?=[\\s/>])[^>]*>`, "g");
  return xml.match(re) ?? [];
}

/** Value of one attribute on an opening tag; undefined when absent. Any attribute order, either quote style. */
export function attrOf(tag: string, name: string): string | undefined {
  const re = new RegExp(`\\s${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`);
  const m = re.exec(tag);
  if (!m) return undefined;
  return xmlUnescape(m[1] ?? m[2] ?? "");
}

/** Attribute of the first element with this name. */
export function attr(xml: string, element: string, name: string): string | undefined {
  const tag = openTags(xml, element)[0];
  return tag === undefined ? undefined : attrOf(tag, name);
}

/** Text content of every element with this name (no nested same-name elements expected). */
export function elementTexts(xml: string, element: string): string[] {
  const e = escapeRegExp(element);
  const re = new RegExp(`<${e}(?=[\\s>])[^>]*>([\\s\\S]*?)</${e}>`, "g");
  const out: string[] = [];
  for (const m of xml.matchAll(re)) out.push(xmlUnescape(m[1] ?? ""));
  return out;
}

/** Whole `<element ...>...</element>` blocks (or self-closing tags), in document order. */
export function elementBlocks(xml: string, element: string): string[] {
  const e = escapeRegExp(element);
  const re = new RegExp(`<${e}(?=[\\s/>])[^>]*?(?:/>|>[\\s\\S]*?</${e}>)`, "g");
  return xml.match(re) ?? [];
}

/** The `<Result>` block of one check in a run receipt. */
export function resultBlock(receipt: string, check: string): string | undefined {
  for (const block of elementBlocks(receipt, "Result")) {
    const tag = openTags(block, "Result")[0];
    if (tag !== undefined && attrOf(tag, "check") === check) return block;
  }
  return undefined;
}

/** Attribute of a check's `<Result>` element. */
export function resultAttr(receipt: string, check: string, name: string): string | undefined {
  const block = resultBlock(receipt, check);
  if (block === undefined) return undefined;
  return attr(block, "Result", name);
}

// ---------------------------------------------------------------- contract model

export interface EnvDef {
  id: string;
  text: string;
  device?: string;
  build?: string;
}

export interface ExpectDef {
  marker: string;
  min?: number;
  max?: number;
}

export interface AutomatedDef {
  kind: "automated";
  id: string;
  command: string;
  budget?: number;
  required?: boolean;
  environment?: string;
}

export interface TraceDef {
  kind: "trace";
  id: string;
  command: string;
  origin: "live" | "replay" | "fixture" | "any";
  expect: (string | ExpectDef)[];
  forbid?: string[];
  budget?: number;
  required?: boolean;
  environment?: string;
}

export interface ManualDef {
  kind: "manual";
  id: string;
  procedure: string;
  required?: boolean;
  environment?: string;
}

export type CheckDef = AutomatedDef | TraceDef | ManualDef;

export interface ContractDef {
  id: string;
  revision?: number;
  title?: string;
  problem?: string;
  change?: string;
  nonGoals?: string[];
  paths?: string[];
  protectedPaths?: string[];
  environments?: EnvDef[];
  checks: CheckDef[];
  decisions?: string[];
  /** Path of a standing project rule the one Constraint cites. */
  rule?: string;
}

export const DEFAULT_BUDGET = 30;

/** The single criterion id of every generated contract; distinctive so FS-01 can look for it. */
export const CRITERION_ID = "ACC1";

function normalizeExpect(e: string | ExpectDef): ExpectDef {
  return typeof e === "string" ? { marker: e } : e;
}

export function contractXml(def: ContractDef): string {
  const rev = def.revision ?? 1;
  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<Contract id="${xmlEscape(def.id)}" revision="${rev}" title="${xmlEscape(def.title ?? "Conformance fixture change")}">`);
  lines.push(`  <Problem>${xmlEscape(def.problem ?? "The product file lacks the line the fixture wants.")}</Problem>`);
  lines.push(`  <Change>${xmlEscape(def.change ?? "The product file carries the wanted line.")}</Change>`);
  lines.push(`  <Constraints>`);
  const rule = def.rule === undefined ? "" : ` rule="${xmlEscape(def.rule)}"`;
  lines.push(`    <Constraint id="K1"${rule}>The fixture scripts stay as they are.</Constraint>`);
  lines.push(`  </Constraints>`);
  lines.push(`  <NonGoals>`);
  (def.nonGoals ?? ["Nothing else changes."]).forEach((text, i) => {
    lines.push(`    <NonGoal id="N${i + 1}">${xmlEscape(text)}</NonGoal>`);
  });
  lines.push(`  </NonGoals>`);
  lines.push(`  <Acceptance>`);
  lines.push(`    <Criterion id="${CRITERION_ID}" checks="${def.checks.map((c) => c.id).join(" ")}">The wanted line is present and observed.</Criterion>`);
  lines.push(`  </Acceptance>`);
  lines.push(`  <Affected>`);
  for (const p of def.paths ?? ["src/**"]) lines.push(`    <Path>${xmlEscape(p)}</Path>`);
  for (const p of def.protectedPaths ?? []) lines.push(`    <Protected>${xmlEscape(p)}</Protected>`);
  lines.push(`  </Affected>`);
  lines.push(`  <Checks>`);
  for (const env of def.environments ?? []) {
    const device = env.device === undefined ? "" : ` device="${xmlEscape(env.device)}"`;
    const build = env.build === undefined ? "" : ` build="${xmlEscape(env.build)}"`;
    lines.push(`    <Environment id="${env.id}"${device}${build}>${xmlEscape(env.text)}</Environment>`);
  }
  for (const c of def.checks) {
    const required = c.required === false ? ` required="false"` : "";
    const environment = c.environment === undefined ? "" : ` environment="${c.environment}"`;
    if (c.kind === "automated") {
      lines.push(`    <Automated id="${c.id}"${required}${environment} budget="${c.budget ?? DEFAULT_BUDGET}">`);
      lines.push(`      <Command>${xmlEscape(c.command)}</Command>`);
      lines.push(`    </Automated>`);
    } else if (c.kind === "trace") {
      lines.push(`    <Trace id="${c.id}"${required}${environment} origin="${c.origin}" budget="${c.budget ?? DEFAULT_BUDGET}">`);
      lines.push(`      <Command>${xmlEscape(c.command)}</Command>`);
      for (const raw of c.expect) {
        const e = normalizeExpect(raw);
        const min = e.min === undefined ? "" : ` min="${e.min}"`;
        const max = e.max === undefined ? "" : ` max="${e.max}"`;
        lines.push(`      <Expect${min}${max}>${xmlEscape(e.marker)}</Expect>`);
      }
      for (const f of c.forbid ?? []) lines.push(`      <Forbid>${xmlEscape(f)}</Forbid>`);
      lines.push(`    </Trace>`);
    } else {
      lines.push(`    <Manual id="${c.id}"${required}${environment}>`);
      lines.push(`      <Procedure>${xmlEscape(c.procedure)}</Procedure>`);
      lines.push(`    </Manual>`);
    }
  }
  lines.push(`  </Checks>`);
  lines.push(`  <Decisions>`);
  (def.decisions ?? ["The owner accepts the fixture as it is."]).forEach((text, i) => {
    lines.push(`    <Decision id="D${i + 1}">${xmlEscape(text)}</Decision>`);
  });
  lines.push(`  </Decisions>`);
  lines.push(`</Contract>`);
  return lines.join("\n") + "\n";
}

function collapse(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/** The canonical definition text of evidence-records.md, computed from the fixture's own model. */
export function canonicalDefinition(def: ContractDef, checkId: string): string {
  const c = def.checks.find((x) => x.id === checkId);
  if (c === undefined) throw new Error(`no check ${checkId} in fixture contract`);
  const out: string[] = [];
  out.push(`kind=${c.kind}`);
  out.push(`id=${c.id}`);
  out.push(`required=${c.required === false ? "false" : "true"}`);
  if (c.kind !== "manual") {
    out.push(`cwd=.`);
    out.push(`budget=${c.budget ?? DEFAULT_BUDGET}`);
  }
  if (c.kind === "trace") out.push(`origin=${c.origin}`);
  if (c.environment !== undefined) {
    const env = (def.environments ?? []).find((e) => e.id === c.environment);
    if (env === undefined) throw new Error(`no environment ${c.environment}`);
    out.push(`environment=${[env.id, env.device ?? "", env.build ?? "", collapse(env.text)].join("|")}`);
  }
  if (c.kind !== "manual") out.push(`command=${collapse(c.command)}`);
  if (c.kind === "trace") {
    for (const raw of c.expect) {
      const e = normalizeExpect(raw);
      out.push(`expect=${e.min ?? 1},${e.max ?? ""}|${collapse(e.marker)}`);
    }
    for (const f of c.forbid ?? []) out.push(`forbid=${collapse(f)}`);
  }
  if (c.kind === "manual") out.push(`procedure=${collapse(c.procedure)}`);
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------- fixture scripts

// Check commands are `bun tools/<script>.js <plain args>`: nothing a shell could quote differently.
// State that must flip without touching the candidate lives in a scratch directory beside the repository.
const SCRIPTS: Record<string, string> = {
  "tools/pass.js": `console.log("fixture check ran");\n`,
  "tools/fail.js": `console.log("fixture check fails on purpose");\nprocess.exit(1);\n`,
  "tools/env.js": [
    `for (const name of ["GRACE5_RUN_ID", "GRACE5_CHANGE", "GRACE5_CHECK", "GRACE5_SOURCE_REVISION", "GRACE5_CANDIDATE"]) {`,
    `  console.log(name + "=" + (process.env[name] ?? "<unset>"));`,
    `}`,
    ``,
  ].join("\n"),
  // bun tools/sleep.js <seconds>: notes that it started, then sleeps.
  "tools/sleep.js": [
    `import { writeFileSync, mkdirSync } from "node:fs";`,
    `import { join } from "node:path";`,
    `const scratch = join(import.meta.dir, "..", "..", "scratch");`,
    `mkdirSync(scratch, { recursive: true });`,
    `writeFileSync(join(scratch, "sleep-started"), String(process.pid));`,
    `console.log("sleeping");`,
    `await Bun.sleep(Number(process.argv[2] ?? "5") * 1000);`,
    `console.log("MARK-A");`,
    ``,
  ].join("\n"),
  // bun tools/flag.js: exits 1 while scratch/fail-flag exists.
  "tools/flag.js": [
    `import { existsSync } from "node:fs";`,
    `import { join } from "node:path";`,
    `if (existsSync(join(import.meta.dir, "..", "..", "scratch", "fail-flag"))) { console.log("flag is set"); process.exit(1); }`,
    `console.log("flag is clear");`,
    ``,
  ].join("\n"),
  // bun tools/gate.js: exits 1 unless src/product.txt carries the wanted line.
  "tools/gate.js": [
    `import { readFileSync } from "node:fs";`,
    `import { join } from "node:path";`,
    `const text = readFileSync(join(import.meta.dir, "..", "src", "product.txt"), "utf8");`,
    `if (!text.includes("fixed")) { console.log("product is not fixed"); process.exit(1); }`,
    `console.log("product is fixed");`,
    ``,
  ].join("\n"),
  // bun tools/emit.js <log name> [origin] [device|-] [build|-|@rev]
  // Prints a recorded log; with an origin, also the provenance line of trace-provenance.md echoing this run.
  "tools/emit.js": [
    `import { readFileSync } from "node:fs";`,
    `import { join } from "node:path";`,
    `const [name, origin, device, build] = process.argv.slice(2);`,
    `process.stdout.write(readFileSync(join(import.meta.dir, "data", name), "utf8"));`,
    `if (origin) {`,
    `  let line = "grace5-provenance: origin=" + origin + " run=" + process.env.GRACE5_RUN_ID;`,
    `  if (device && device !== "-") line += " device=" + device;`,
    `  if (build && build !== "-") {`,
    `    const rev = process.env.GRACE5_SOURCE_REVISION ?? "";`,
    `    line += " build=" + (build === "@rev" ? "app-" + rev.slice(0, 8) : build);`,
    `  }`,
    `  console.log(line);`,
    `}`,
    ``,
  ].join("\n"),
  "tools/data/ordered.log": "boot\nMARK-A\nMARK-B\nMARK-C\ndone\n",
  "tools/data/shuffled.log": "boot\nMARK-B\nMARK-A\nMARK-C\ndone\n",
  "tools/data/repeat.log": "boot\nMARK-A\nMARK-A\nMARK-B\nMARK-C\ndone\n",
  "tools/data/bad.log": "boot\nMARK-A\nMARK-BAD\nMARK-B\nMARK-C\ndone\n",
  // An old successful log, carrying the provenance line of the run that once produced it.
  "tools/data/old.log":
    "boot\nMARK-A\nMARK-B\nMARK-C\ngrace5-provenance: origin=live run=00000000-old-run-0000 device=DEV-1 build=app-00000000\ndone\n",
  "src/product.txt": "product line one\n",
  "src/other.txt": "another tracked file\n",
  "src/secret/key.txt": "do not write\n",
  "docs/note.md": "A note outside the write boundary.\n",
};

// ---------------------------------------------------------------- CLI results

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
  /** stdout and stderr together: the documents do not say which stream carries a refusal. */
  out: string;
  lines: string[];
  elapsedMs: number;
}

export interface CheckInfo extends CliResult {
  contractSha: string;
  definitions: Record<string, string>;
  words: number;
  checks: number;
  defects: string[];
}

export function hasLine(result: CliResult, line: string | RegExp): boolean {
  return result.lines.some((l) => (typeof line === "string" ? l === line : line.test(l)));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface BriefOptions {
  revision?: number;
  omitProtected?: string[];
  openFinding?: boolean;
  /** Replaces the grace5:contract-sha256 meta value; null leaves the meta element out. */
  contractShaMeta?: string | null;
}

export interface ApprovalOptions {
  revision?: number;
  decision?: "approved" | "rejected";
  executes?: boolean;
  /** Legacy fields, emitted only when explicitly requested to test compatibility. */
  execution?: boolean;
  /** Emits a legacy Source element; the kernel ignores it. Omitted by default. */
  source?: string;
  /** Leaves Statement out, for the rejected-without-a-reason case. */
  omitStatement?: boolean;
  /** Check ids left without a Bound element. */
  omitBound?: string[];
}

export interface FindingDef {
  id: string;
  severity: "blocking" | "non-blocking";
  status: "open" | "resolved" | "owner-disposed";
  text?: string;
  /** For owner-disposed: false leaves the OwnerDecision element out. */
  ownerDecision?: boolean;
}

export interface ReviewOptions {
  findings?: FindingDef[];
  status?: "completed" | "incomplete";
  /** Check ids whose Adequacy says discriminates="false". */
  notDiscriminating?: string[];
  /** Check ids with no Adequacy statement at all. */
  omitAdequacy?: string[];
  /** Overrides of what the record says it covered. */
  startRevision?: string;
  endRevision?: string;
  contractSha?: string;
  candidate?: string;
  rules?: { rule: string; verdict: "upheld" | "violated" | "not-applicable" }[];
}

export interface ObserveOptions {
  build?: string;
  environment?: string;
  reference?: string;
  note?: string;
}

let kernelVersionCache: string | undefined;

/** The version `grace5 --version` reports. Every fixture repository is pinned to it (upgrade.md), since any other pin is refused. */
export function kernelVersion(): string {
  if (kernelVersionCache === undefined) {
    const r = spawnSync(process.execPath, [CLI, "--version"], { encoding: "utf8", windowsHide: true });
    const m = /^grace5 (\S+)/.exec((r.stdout ?? "").trim());
    if (!m) throw new Error(`grace5 --version printed no version: ${r.stdout ?? ""}${r.stderr ?? ""}`);
    kernelVersionCache = m[1] ?? "";
  }
  return kernelVersionCache;
}

export const PIN_PATH = ".grace5/kernel-version";
/** The local ignore file of upgrade.md and its two lines. */
export const LOCAL_IGNORE_PATH = ".grace5/.gitignore";
export const LOCAL_IGNORE_TEXT = "changes/*/records/logs/\nchanges/closed/*/records/logs/\n";
/** Where a repository may hold the installed grace5-* skills (upgrade.md). */
export const SKILL_LOCATIONS = [".agents/skills", ".claude/skills"] as const;

/** The names of the skills the kernel packages, read from packages/skills/: the directories the candidate rule excludes under each location. */
export function packagedSkillNames(): string[] {
  return fs
    .readdirSync(path.join(REPO_ROOT, "packages", "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("grace5-"))
    .map((entry) => entry.name)
    .sort();
}

const scenarios: Scenario[] = [];

/** Removes every temporary repository made so far. Call from afterAll. */
export function disposeAll(): void {
  for (const s of scenarios.splice(0)) s.dispose();
}

/** One temporary git repository with one (or more) GRACE 5 change directories. */
export class Scenario {
  readonly root: string;
  readonly repo: string;
  readonly scratch: string;
  def: ContractDef;
  /** Latest `check` output per revision, taken while preparing. */
  readonly prepared = new Map<number, CheckInfo>();

  constructor(def: ContractDef) {
    this.def = def;
    this.root = fs.mkdtempSync(path.join(os.tmpdir(), "grace5-conf-"));
    this.repo = path.join(this.root, "repo");
    this.scratch = path.join(this.root, "scratch");
    fs.mkdirSync(this.repo);
    fs.mkdirSync(this.scratch);
    scenarios.push(this);
    this.rawGit(["init", "-q"]);
    this.git("config", "user.name", "Conformance Fixture");
    this.git("config", "user.email", "fixture@example.invalid");
    this.git("config", "core.autocrlf", "false");
    this.git("config", "commit.gpgsign", "false");
    for (const [rel, content] of Object.entries(SCRIPTS)) this.write(rel, content);
    this.writeContract(def);
    this.pin(kernelVersion());
  }

  /** Writes the version pin, or removes it when given undefined (the state of a repository before the pin existed). */
  pin(version: string | undefined): void {
    const file = path.join(this.repo, PIN_PATH);
    if (version === undefined) fs.rmSync(file, { force: true });
    else this.write(PIN_PATH, `${version}\n`);
  }

  /** The pin as a command reads it: the file's text, or none. */
  readPin(): string | undefined {
    const file = path.join(this.repo, PIN_PATH);
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
  }

  get id(): string {
    return this.def.id;
  }

  get revision(): number {
    return this.def.revision ?? 1;
  }

  /** The open location of this change, or the closed one once `close` has moved it (commands.md). */
  get changeDir(): string {
    const open = this.openChangeDir;
    return fs.existsSync(open) || !fs.existsSync(this.closedChangeDir) ? open : this.closedChangeDir;
  }

  get openChangeDir(): string {
    return path.join(this.repo, ".grace5", "changes", this.id);
  }

  get closedChangeDir(): string {
    return path.join(this.repo, ".grace5", "changes", "closed", this.id);
  }

  get recordsDir(): string {
    return path.join(this.changeDir, "records");
  }

  // ------------------------------------------------------------ files and git

  write(rel: string, content: string): void {
    const file = path.join(this.repo, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }

  read(rel: string): string {
    return fs.readFileSync(path.join(this.repo, rel), "utf8");
  }

  exists(rel: string): boolean {
    return fs.existsSync(path.join(this.repo, rel));
  }

  record(name: string): string {
    return fs.readFileSync(path.join(this.recordsDir, name), "utf8");
  }

  /** The contract text, wherever the change directory is now. */
  contractText(): string {
    return fs.readFileSync(path.join(this.changeDir, "contract.xml"), "utf8");
  }

  hasRecord(name: string): boolean {
    return fs.existsSync(path.join(this.recordsDir, name));
  }

  private rawGit(args: string[]): string {
    // Guard: git only ever runs inside the temporary repository this scenario made.
    const tmp = fs.realpathSync(os.tmpdir());
    const cwd = fs.realpathSync(this.repo);
    if (!cwd.startsWith(tmp) || path.basename(path.dirname(cwd)).indexOf("grace5-conf-") !== 0) {
      throw new Error(`refusing to run git outside a temporary fixture: ${cwd}`);
    }
    if (args[0] !== "init" && !fs.existsSync(path.join(cwd, ".git"))) {
      throw new Error(`fixture repository has no .git of its own: ${cwd}`);
    }
    const r = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}${r.stdout}`);
    return r.stdout;
  }

  git(...args: string[]): string {
    return this.rawGit(args);
  }

  commit(message: string): string {
    this.git("add", "-A");
    this.git("commit", "-q", "--allow-empty", "-m", `${message}\n\nChange: ${this.id}`);
    return this.head();
  }

  head(): string {
    return this.git("rev-parse", "HEAD").trim();
  }

  porcelain(): string {
    return this.git("status", "--porcelain", "--untracked-files=all");
  }

  /**
   * The candidate of source-identity.md, computed here from `git ls-tree -r`: the kernel-managed paths removed, which are
   * the whole `.grace5/` directory and the installed grace5-* skill directories named by the packaged skills. An earlier
   * `rule` gives the candidate that kernel's rule gave the same tree: 0.3.0 removed the change directories only, 0.4.0
   * the change directories and the pin.
   */
  computeCandidate(revision = "HEAD", rule: "0.3.0" | "0.4.0" | "0.5.0" = "0.5.0"): string {
    const managed = rule === "0.3.0" ? [".grace5/changes/"] : rule === "0.4.0" ? [".grace5/changes/", PIN_PATH] : [".grace5/", ...SKILL_LOCATIONS.flatMap((location) => packagedSkillNames().map((name) => `${location}/${name}/`))];
    const entries: { path: string; line: string }[] = [];
    for (const row of this.git("ls-tree", "-r", revision).split("\n")) {
      const m = /^(\d+) \w+ ([0-9a-f]+)\t(.+)$/.exec(row);
      if (!m) continue;
      const mode = m[1] ?? "";
      const object = m[2] ?? "";
      const p = m[3] ?? "";
      if (managed.some((prefix) => (prefix.endsWith("/") ? p.startsWith(prefix) : p === prefix))) continue;
      entries.push({ path: p, line: `${mode} ${object} ${p}\n` });
    }
    entries.sort((a, b) => Buffer.compare(Buffer.from(a.path, "utf8"), Buffer.from(b.path, "utf8")));
    return sha256(entries.map((e) => e.line).join(""));
  }

  /** Edits the product file and commits: a new candidate. */
  changeProduct(line: string): string {
    this.write("src/product.txt", this.read("src/product.txt") + line + "\n");
    return this.commit(`product: ${line}`);
  }

  // ------------------------------------------------------------ the kernel

  cli(args: string[], timeoutMs = 120_000): CliResult {
    const started = Date.now();
    const r = spawnSync(process.execPath, [CLI, "--root", this.repo, ...args], {
      cwd: this.scratch,
      encoding: "utf8",
      timeout: timeoutMs,
      windowsHide: true,
    });
    const stdout = r.stdout ?? "";
    const stderr = r.stderr ?? "";
    const out = stdout + (stdout.endsWith("\n") || stdout === "" ? "" : "\n") + stderr;
    return {
      code: r.status ?? -1,
      stdout,
      stderr,
      out,
      lines: out.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l !== ""),
      elapsedMs: Date.now() - started,
    };
  }

  /** Starts the kernel without waiting, for the interrupted-run case. */
  cliAsync(args: string[]): ChildProcess {
    return spawn(process.execPath, [CLI, "--root", this.repo, ...args], {
      cwd: this.scratch,
      stdio: "ignore",
      windowsHide: true,
      detached: process.platform !== "win32",
    });
  }

  check(change = this.id): CheckInfo {
    const r = this.cli(["check", change]);
    const definitions: Record<string, string> = {};
    let contractSha = "";
    let words = -1;
    let checks = -1;
    const defects: string[] = [];
    for (const line of r.lines) {
      let m = /^contract-sha256: ([0-9a-f]{64})$/.exec(line);
      if (m) contractSha = m[1] ?? "";
      m = /^definition (\S+): ([0-9a-f]{64})$/.exec(line);
      if (m) definitions[m[1] ?? ""] = m[2] ?? "";
      m = /^words: (\d+) \(target 600\)$/.exec(line);
      if (m) words = Number(m[1]);
      m = /^checks: (\d+) \(target 8\)$/.exec(line);
      if (m) checks = Number(m[1]);
      m = /^defect: (.*)$/.exec(line);
      if (m) defects.push(m[1] ?? "");
    }
    return { ...r, contractSha, definitions, words, checks, defects };
  }

  status(): CliResult {
    return this.cli(["status", this.id]);
  }

  run(...flags: string[]): CliResult {
    return this.cli(["run", this.id, ...flags]);
  }

  start(...flags: string[]): CliResult {
    return this.cli(["run", this.id, "--start", ...flags]);
  }

  close(): CliResult {
    return this.cli(["close", this.id]);
  }

  observe(check: string, verdict: "passed" | "failed" | "blocked" | "not-attempted", o: ObserveOptions = {}): CliResult {
    const flags = ["--check", check, "--observe", verdict, "--build", o.build ?? "bench-build-7"];
    if (o.environment !== undefined) flags.push("--environment", o.environment);
    if (o.reference !== undefined) flags.push("--reference", o.reference);
    flags.push("--note", o.note ?? "Seen as the procedure describes.");
    return this.run(...flags);
  }

  // ------------------------------------------------------------ authoring records

  writeContract(def: ContractDef): void {
    this.def = def;
    this.write(`.grace5/changes/${def.id}/contract.xml`, contractXml(def));
  }

  private requirePrepared(revision: number): CheckInfo {
    const info = this.prepared.get(revision);
    if (info === undefined) throw new Error(`revision ${revision} was not checked before writing its records`);
    return info;
  }

  /** Runs `check` and keeps what it printed, as the author of a brief and an approval would. */
  takeHashes(): CheckInfo {
    const info = this.check();
    if (!HEX64.test(info.contractSha)) {
      throw new Error(`grace5 check printed no contract-sha256 line (exit ${info.code}):\n${info.out}`);
    }
    for (const c of this.def.checks) {
      if (!HEX64.test(info.definitions[c.id] ?? "")) {
        throw new Error(`grace5 check printed no definition line for ${c.id}:\n${info.out}`);
      }
    }
    this.prepared.set(this.revision, info);
    return info;
  }

  /** Fills the template's structure for the current contract (brief.md). */
  writeBrief(o: BriefOptions = {}): void {
    const rev = o.revision ?? this.revision;
    const info = this.requirePrepared(rev);
    const def = this.def;
    const template = fs.readFileSync(path.join(ARCH, "templates", "brief.html"), "utf8");
    const style = /<style>[\s\S]*?<\/style>/.exec(template)?.[0];
    if (style === undefined) throw new Error("the brief template has no style block");
    const title = def.title ?? "Conformance fixture change";
    const basis = rev > 1 ? "difference" : "full";
    const omitted = new Set(o.omitProtected ?? []);
    const h = (t: string) => xmlEscape(t);
    const rows = def.checks.map((c) => {
      const required = c.required === false ? "false" : "true";
      const cls = c.kind + (c.required === false ? " optional" : "");
      return `          <tr class="${cls}" data-check="${c.id}" data-kind="${c.kind}" data-required="${required}"><td><b>${c.id}</b> ${c.kind}</td><td class="shows">The ${c.kind} check ${c.id} came out as stated.</td><td class="limits">Nothing beyond that single statement.</td></tr>`;
    });
    const page = [
      `<!doctype html>`,
      `<html lang="en">`,
      `<head>`,
      `<meta charset="utf-8">`,
      `<meta name="viewport" content="width=device-width, initial-scale=1">`,
      `<title>Brief: ${def.id} revision ${rev}</title>`,
      `<meta name="grace5:change" content="${def.id}">`,
      `<meta name="grace5:revision" content="${rev}">`,
      ...(o.contractShaMeta === null ? [] : [`<meta name="grace5:contract-sha256" content="${o.contractShaMeta ?? info.contractSha}">`]),
      `<meta name="grace5:date" content="${today()}">`,
      `<meta name="grace5:writer" content="independent">`,
      `<meta name="grace5:basis" content="${basis}">`,
      ...(rev > 1 ? [`<meta name="grace5:previous-revision" content="${rev - 1}">`] : []),
      `<meta name="grace5:words" content="${info.words}">`,
      `<meta name="grace5:target-words" content="600">`,
      `<meta name="grace5:checks" content="${info.checks}">`,
      `<meta name="grace5:target-checks" content="8">`,
      style,
      `</head>`,
      `<body>`,
      `<header>`,
      `  <h1>${h(title)}</h1>`,
      `  <p class="lead">Brief for approval. Change <code>${def.id}</code>, revision ${rev}, ${today()}. ${basis === "full" ? "Full" : "Difference"} brief, written by: independent reader.</p>`,
      `</header>`,
      `<main>`,
      `  <section id="result">`,
      `    <h2>What you get</h2>`,
      `    <div>`,
      `      <ul>`,
      `        <li>${h(def.change ?? "The product file carries the wanted line.")}</li>`,
      `      </ul>`,
      `    </div>`,
      `  </section>`,
      `  <section id="boundaries">`,
      `    <h2>Where it may reach</h2>`,
      `    <div>`,
      `      <ul class="writes">`,
      ...(def.paths ?? ["src/**"]).map((p) => `        <li>May write ${h(p)}.</li>`),
      `      </ul>`,
      `      <h3>Left alone on purpose</h3>`,
      `      <ul class="exclusions">`,
      ...(def.nonGoals ?? ["Nothing else changes."]).map((t, i) => `        <li>N${i + 1}: ${h(t)}</li>`),
      `      </ul>`,
      `      <h3>Must not be written</h3>`,
      `      <ul class="protected">`,
      ...(def.protectedPaths ?? []).filter((p) => !omitted.has(p)).map((p) => `        <li data-protected="${h(p)}">${h(p)}</li>`),
      `      </ul>`,
      `    </div>`,
      `  </section>`,
      `  <section id="evidence">`,
      `    <h2>What will count as done</h2>`,
      `    <div>`,
      `      <table>`,
      `        <thead><tr><th>Check</th><th>A pass shows</th><th>A pass does not show</th></tr></thead>`,
      `        <tbody>`,
      ...rows,
      `        </tbody>`,
      `      </table>`,
      `    </div>`,
      `  </section>`,
      `  <section id="decisions">`,
      `    <h2>Decisions to check against your memory</h2>`,
      `    <div>`,
      `      <ul>`,
      ...(def.decisions ?? ["The owner accepts the fixture as it is."]).map(
        (t, i) => `        <li data-decision="D${i + 1}"><b>D${i + 1}</b><span>${h(t)}</span></li>`,
      ),
      `      </ul>`,
      `    </div>`,
      `  </section>`,
      `  <section id="risks">`,
      `    <h2>Risks</h2>`,
      `    <div>`,
      `      <ul>`,
      `        <li>The fixture checks say little about a real product.</li>`,
      `      </ul>`,
      `    </div>`,
      `  </section>`,
      `  <section id="burdens">`,
      `    <h2>What it asks of you</h2>`,
      `    <div>`,
      `      <ul>`,
      `        <li>Carry out any manual procedure the evidence table lists.</li>`,
      `      </ul>`,
      `    </div>`,
      `  </section>`,
      `  <section id="findings">`,
      `    <h2>Returned to the author</h2>`,
      `    <div>`,
      `      <ul>`,
      o.openFinding === true
        ? `        <li data-finding="open"><span>Open</span><span>A term is undefined and the author has not answered.</span></li>`
        : `        <li data-finding="resolved"><span>Resolved</span><span>A term was undefined. Resolved: the Change now defines it.</span></li>`,
      `      </ul>`,
      `    </div>`,
      `  </section>`,
      `</main>`,
      `<footer>`,
      `  <p id="size">Contract size: ${info.words} words against a target of 600, ${info.checks} checks against 8.</p>`,
      `  <p>This brief describes contract text with SHA-256 <code>${info.contractSha}</code>.</p>`,
      `  <p class="say">Decision: approve, or reject with a reason. Approval is recorded separately and authorizes execution. A hold defers execution until the change or batch is explicitly started; it adds no kernel state.</p>`,
      `</footer>`,
      `</body>`,
      `</html>`,
      ``,
    ].join("\n");
    this.write(`.grace5/changes/${def.id}/records/brief-${rev}.html`, page);
  }

  /** Writes approval-<rev>.xml from the hashes `check` printed and the bytes of the brief on disk. */
  writeApproval(o: ApprovalOptions = {}): void {
    const rev = o.revision ?? this.revision;
    const info = this.requirePrepared(rev);
    const decision = o.decision ?? "approved";
    const legacyExecutes = o.executes === undefined ? "" : ` executes="${o.executes}"`;
    const briefSha = sha256(fs.readFileSync(path.join(this.recordsDir, `brief-${rev}.html`)));
    const statement = o.omitStatement === true ? "" : decision === "approved" ? "approved" : "Rejected: not this way.";
    const lines = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<Approval change="${this.id}" revision="${rev}" contract-sha256="${info.contractSha}" brief-sha256="${briefSha}" date="${today()}" decision="${decision}"${legacyExecutes}>`,
      ...(statement === "" ? [] : [`  <Statement>${statement}</Statement>`]),
      ...(o.source === undefined ? [] : [`  <Source>${o.source}</Source>`]),
    ];
    if (decision === "approved") {
      for (const c of this.def.checks) {
        if ((o.omitBound ?? []).includes(c.id)) continue;
        lines.push(`  <Bound check="${c.id}" definition-sha256="${info.definitions[c.id] ?? ""}"/>`);
      }
    }
    if (o.execution === true) {
      lines.push(`  <Execution date="${today()}">`);
      lines.push(`    <Statement>Go ahead now.</Statement>`);
      lines.push(`    <Source>Fixture conversation, a later message.</Source>`);
      lines.push(`  </Execution>`);
    }
    lines.push(`</Approval>`, ``);
    this.write(`.grace5/changes/${this.id}/records/approval-${rev}.xml`, lines.join("\n"));
  }

  /** check, brief, approval that authorizes execution, and one commit holding everything. */
  prepare(): CheckInfo {
    const info = this.takeHashes();
    this.writeBrief();
    this.writeApproval();
    this.commit("prepare the change");
    return info;
  }

  // ------------------------------------------------------------ reading records

  runNumbers(): number[] {
    if (!fs.existsSync(this.recordsDir)) return [];
    const ns: number[] = [];
    for (const name of fs.readdirSync(this.recordsDir)) {
      const m = /^run-(\d+)\.xml$/.exec(name);
      if (m) ns.push(Number(m[1]));
    }
    return ns.sort((a, b) => a - b);
  }

  latestRun(): number {
    const n = this.runNumbers().at(-1);
    if (n === undefined) throw new Error("no run receipt was written");
    return n;
  }

  receipt(n = this.latestRun()): string {
    return this.record(`run-${n}.xml`);
  }

  /** Bytes of a log named by a receipt, wherever the kernel's path is relative to. */
  readLog(logPath: string): Buffer {
    const candidates = [
      path.isAbsolute(logPath) ? logPath : path.join(this.repo, logPath),
      path.join(this.changeDir, logPath),
      path.join(this.recordsDir, logPath),
    ];
    for (const c of candidates) if (fs.existsSync(c) && fs.statSync(c).isFile()) return fs.readFileSync(c);
    throw new Error(`log ${logPath} of the receipt does not exist`);
  }

  /** review-<n>.xml per schemas/review.xsd: candidate from the latest run receipt, revisions from git and the start run. */
  writeReview(o: ReviewOptions = {}): number {
    const existing = fs.existsSync(this.recordsDir)
      ? fs.readdirSync(this.recordsDir).filter((f) => /^review-\d+\.xml$/.test(f)).length
      : 0;
    const n = existing + 1;
    const candidate = o.candidate ?? (this.runNumbers().length > 0 ? (attr(this.receipt(), "Run", "candidate") ?? "") : this.computeCandidate());
    let startRevision = this.head();
    for (const rn of this.runNumbers()) {
      const r = this.receipt(rn);
      if (attr(r, "Run", "start") === "true") {
        startRevision = attr(r, "Run", "source-revision") ?? startRevision;
        break;
      }
    }
    if (o.startRevision !== undefined) startRevision = o.startRevision;
    const contractSha = o.contractSha ?? sha256(fs.readFileSync(path.join(this.changeDir, "contract.xml"), "utf8").replace(/\r\n/g, "\n"));
    const lines = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<Review change="${this.id}" revision="${this.revision}" contract-sha256="${contractSha}" n="${n}" date="${today()}" independence="independent" start-revision="${startRevision}" end-revision="${o.endRevision ?? this.head()}" candidate="${candidate}" status="${o.status ?? "completed"}">`,
      `  <Independence>A reviewer that saw the contract and the complete diff, and nothing of the authoring conversation.</Independence>`,
    ];
    for (const f of o.findings ?? []) {
      lines.push(`  <Finding id="${f.id}" severity="${f.severity}" status="${f.status}">`);
      lines.push(`    <Text>${xmlEscape(f.text ?? "The product line is not what the Change states.")}</Text>`);
      if (f.status === "resolved") lines.push(`    <Resolution>Shown to be as the Change states.</Resolution>`);
      if (f.status === "owner-disposed" && f.ownerDecision !== false) lines.push(`    <OwnerDecision>Accepted as an unresolved limitation.</OwnerDecision>`);
      lines.push(`  </Finding>`);
    }
    const omit = new Set(o.omitAdequacy ?? []);
    const weak = new Set(o.notDiscriminating ?? []);
    for (const c of this.def.checks) {
      if (omit.has(c.id)) continue;
      lines.push(`  <Adequacy check="${c.id}" discriminates="${weak.has(c.id) ? "false" : "true"}">Read against the criterion it serves.</Adequacy>`);
    }
    for (const r of o.rules ?? []) lines.push(`  <Rule rule="${xmlEscape(r.rule)}" verdict="${r.verdict}">Read against the complete diff.</Rule>`);
    lines.push(`</Review>`, ``);
    this.write(`.grace5/changes/${this.id}/records/review-${n}.xml`, lines.join("\n"));
    return n;
  }

  // ------------------------------------------------------------ cleanup

  dispose(): void {
    try {
      fs.rmSync(this.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      // A killed run can hold a handle for a moment on Windows; the OS temp directory is the right place to leave it.
    }
  }
}

// ---------------------------------------------------------------- shorthand

export function automated(id: string, command = "bun tools/pass.js", extra: Partial<Omit<AutomatedDef, "kind" | "id" | "command">> = {}): AutomatedDef {
  return { kind: "automated", id, command, ...extra };
}

export function manual(id: string, extra: Partial<Omit<ManualDef, "kind" | "id">> = {}): ManualDef {
  return {
    kind: "manual",
    id,
    procedure: "Open the product file on the bench machine and read the wanted line aloud. Pass: the line is there.",
    ...extra,
  };
}

export function trace(
  id: string,
  command: string,
  origin: TraceDef["origin"],
  extra: Partial<Omit<TraceDef, "kind" | "id" | "command" | "origin">> = {},
): TraceDef {
  return { kind: "trace", id, command, origin, expect: ["MARK-A", "MARK-B", "MARK-C"], ...extra };
}

/** A prepared and approved change, not yet started. */
export function prepared(def: ContractDef): Scenario {
  const s = new Scenario(def);
  s.prepare();
  return s;
}

/** Kills a process and everything under it, without relying on POSIX signals on Windows. */
export function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { encoding: "utf8" });
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

export async function waitFor(condition: () => boolean, timeoutMs: number, stepMs = 100): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  return condition();
}

export function waitForExit(child: ChildProcess, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    const timer = setTimeout(() => resolve(null), timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

// ------------------------------------------------------- shared upgrade fixtures
// Moved verbatim from upgrade.test.ts by C-0010 so the split topic files share one copy.

export const UPGRADE_VERSION = kernelVersion();
/** The line the 0.2.0 to 0.4.0 kernels wrote into a project's .gitignore; this kernel leaves it alone wherever it finds it. */
export const OLD_PROJECT_IGNORE_LINE = ".grace5/changes/closed/*/records/logs/";
export const PACKAGED_SKILLS = path.join(REPO_ROOT, "packages", "skills");
export const LOCAL_IGNORE_STEP = `step: 0.4.0 -> 0.5.0: write the local ignore file ${LOCAL_IGNORE_PATH}`;

export const behind = (pin: string): string => `refused: repository state is at ${pin}, kernel is ${UPGRADE_VERSION}: run grace5 upgrade`;
export const ahead = (pin: string): string => `refused: repository state is at ${pin}, kernel is ${UPGRADE_VERSION}: kernel too old`;
export const unreadable = (reason: string): string => `refused: repository pin is unreadable: ${PIN_PATH} is not a version: ${reason}`;
export const closedPath = (id: string): string => `.grace5/changes/closed/${id}`;

/** An injected step for the chain runner: one that touches no change unless the case says otherwise. */
export function fixtureStep(step: Omit<Step, "touches"> & Partial<Pick<Step, "touches">>): Step {
  return { touches: () => [], ...step };
}

/** The `candidate:` line of `status <id>`. */
export function candidateLine(s: Scenario, id = s.id): string {
  const line = s.cli(["status", id]).lines.find((l) => l.startsWith("candidate: "));
  if (line === undefined) throw new Error(`status ${id} printed no candidate line`);
  return line;
}

/** Starts, changes the product, takes final evidence, writes the review and closes. Nothing is committed after the run, so the logs stay untracked. */
export function closeFully(s: Scenario): CliResult {
  expect(s.start().code).toBe(0);
  s.changeProduct("the wanted line");
  expect(s.run().code).toBe(0);
  s.writeReview();
  const close = s.close();
  expect(close.code).toBe(0);
  return close;
}

/** A second change in the same repository, prepared and closed; the scenario then speaks for that change. */
export function closeSecond(s: Scenario, def: ContractDef): void {
  s.writeContract(def);
  s.prepare();
  closeFully(s);
}

/** A repository as the 0.1.0 kernel left it: the closed change a sibling under .grace5/changes/, no pin, no ignore file anywhere. */
export function asVersion010(s: Scenario): void {
  fs.renameSync(s.closedChangeDir, s.openChangeDir);
  s.pin(undefined);
  fs.rmSync(path.join(s.repo, ".gitignore"), { force: true });
  fs.rmSync(path.join(s.repo, LOCAL_IGNORE_PATH), { force: true });
}

/** The versions a plan or an applied chain walks through, read from its step and bump lines; must start at `from` and end at the kernel's version. */
export function versionsOf(result: CliResult): string[] {
  const versions: string[] = [];
  for (const line of result.lines) {
    const m = /^(step|bump): (\d+\.\d+\.\d+) -> (\d+\.\d+\.\d+): .+$/.exec(line);
    if (!m) continue;
    if (versions.length === 0) versions.push(m[2] ?? "");
    expect(versions.at(-1)).toBe(m[2]);
    versions.push(m[3] ?? "");
  }
  return versions;
}

export function readSkill(rel: string): string {
  return fs.readFileSync(path.join(PACKAGED_SKILLS, rel), "utf8");
}

// ------------------------------------------------------------- review-gaps fixtures
// Moved verbatim from review-gaps.test.ts by C-0010 so the split topic files share one copy.

export function streamLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l !== "");
}

export function expectRefusal(s: Scenario, close: CliResult, phrase: string | RegExp): void {
  expect(close.code).toBe(1);
  expect(hasLine(close, typeof phrase === "string" ? `refused: ${phrase}` : phrase)).toBe(true);
  expect(s.hasRecord("close.xml")).toBe(false);
}

/** Started, product changed and committed, final evidence taken: only the review is missing. */
export function evidenced(def: ContractDef): { s: Scenario; startHead: string } {
  const s = prepared(def);
  const startHead = s.head();
  expect(s.start().code).toBe(0);
  s.changeProduct("the wanted line");
  expect(s.run().code).toBe(0);
  return { s, startHead };
}

/** Rewrites history: one orphan commit holds the same tree, the old branch and its objects are gone. */
export function loseHistory(s: Scenario, startHead: string): void {
  const branch = s.git("rev-parse", "--abbrev-ref", "HEAD").trim();
  s.git("checkout", "-q", "--orphan", "rewritten");
  s.git("add", "-A");
  s.git("commit", "-q", "-m", "history rewritten");
  s.git("branch", "-D", branch);
  s.git("reflog", "expire", "--expire=now", "--all");
  s.git("gc", "-q", "--prune=now");
  const probe = spawnSync("git", ["cat-file", "-e", `${startHead}^{commit}`], { cwd: s.repo, encoding: "utf8" });
  expect(probe.status).not.toBe(0);
}
