// Generates the three harness packages under packages/ from the canonical skills in skills/ and the
// advisor guidance and orchestration extension in models/architecture/, records their bytes in the tracked manifest
// models/architecture/package-manifest.json, and generates models/architecture/cli-reference.md from the
// CLI help text. The generated packages/ tree is a build output, excluded by .gitignore and never tracked,
// so `--verify` regenerates in memory and compares with the manifest, needing no prior build; where a built
// packages/ tree exists it is compared with the generation too, so a stale, missing or extra entry is
// reported. `bun run package` is the only writer.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CLI_REFERENCE_PATH, generateCliReference } from "./cli-reference";

const PACKAGES_DIR = "packages";
const SKILLS_DIR = "skills";
const PACKAGE_NAME = "grace5";
const PACKAGE_IDS = ["claude-plugin", "openpackage", "skills"] as const;
type PackageId = (typeof PACKAGE_IDS)[number];

/** The tracked manifest of the generated distributions: `<package>/<relative path>` to SHA-256, recorded by `bun run package`. */
export const MANIFEST_PATH = "models/architecture/package-manifest.json";

/** The advisor guidance resource: the maintained source and where each generated package ships it. */
const GUIDANCE_SOURCE = "models/architecture/advisor-guidance.md";
const GUIDANCE_TARGET = "advisor-guidance.md";
const ORCHESTRATION_SOURCE = "models/architecture/extensions/orchestration.md";

type Files = Map<string, Buffer>;

interface Meta {
  description: string;
  version: string;
  license: string;
}

/** One generation: the files of each package and the flattened `<package>/<relative path>` view the manifest records. */
export interface Materialization {
  readonly packages: ReadonlyMap<PackageId, Files>;
  readonly files: Map<string, Buffer>;
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function lf(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function field(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value === "") throw new Error(`package.json has no ${key}`);
  return value;
}

function readMeta(root: string): Meta {
  const parsed: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (typeof parsed !== "object" || parsed === null) throw new Error("package.json is not an object");
  const record = parsed as Record<string, unknown>;
  return { description: field(record, "description"), version: field(record, "version"), license: field(record, "license") };
}

/** Every file under dir, as forward-slash paths relative to it, sorted by code unit. */
function listFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string, prefix: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(current, entry.name), rel);
      else found.push(rel);
    }
  };
  if (existsSync(dir)) walk(dir, "");
  return found.sort(compare);
}

/** The canonical skills: path relative to skills/ mapped to LF-normalised content. */
function readSkills(root: string): Map<string, string> {
  const dir = join(root, SKILLS_DIR);
  const skills = new Map<string, string>();
  for (const rel of listFiles(dir)) skills.set(rel, lf(readFileSync(join(dir, rel), "utf8")));
  const names = [...new Set([...skills.keys()].map((rel) => rel.split("/")[0] ?? ""))];
  if (names.length === 0) throw new Error(`no skills found under ${SKILLS_DIR}/`);
  for (const name of names) {
    if (!skills.has(`${name}/SKILL.md`)) throw new Error(`${SKILLS_DIR}/${name} has no SKILL.md`);
  }
  return skills;
}

/** The packaged advisor guidance resource: models/architecture/advisor-guidance.md, LF-normalised. */
function readGuidance(root: string): string {
  const path = join(root, GUIDANCE_SOURCE);
  if (!existsSync(path)) throw new Error(`${GUIDANCE_SOURCE} is missing`);
  return lf(readFileSync(path, "utf8"));
}

/** A YAML scalar, quoted whenever a plain scalar could be misread. */
function yamlScalar(value: string): string {
  const plain = /^[A-Za-z0-9][A-Za-z0-9 ._/()@+,-]*$/.test(value) && !/\s$/.test(value);
  const ambiguous = /^(true|false|yes|no|on|off|null|~)$/i.test(value) || /^[-+]?[0-9.]+([eE][-+]?[0-9]+)?$/.test(value);
  return plain && !ambiguous ? value : JSON.stringify(value);
}

function readme(what: string): string {
  return `This ${what} is generated from \`skills/\` by \`bun run package\` and must not be edited; edit the skill under \`skills/\` and regenerate.\n`;
}

function generatePackage(id: PackageId, meta: Meta, skills: Map<string, string>, guidance: string, orchestration: string): Files {
  const files: Files = new Map();
  const put = (path: string, text: string): void => {
    files.set(path, Buffer.from(lf(text), "utf8"));
  };
  put(GUIDANCE_TARGET, guidance);
  put("extensions/orchestration.md", orchestration);
  switch (id) {
    case "claude-plugin": {
      const manifest = { name: PACKAGE_NAME, description: meta.description, version: meta.version };
      put(".claude-plugin/plugin.json", `${JSON.stringify(manifest, null, 2)}\n`);
      put("README.md", readme("Claude plugin"));
      for (const [rel, text] of skills) put(`skills/${rel}`, text);
      break;
    }
    case "openpackage": {
      const lines = [
        `name: ${yamlScalar(PACKAGE_NAME)}`,
        `description: ${yamlScalar(meta.description)}`,
        `version: ${JSON.stringify(meta.version)}`,
        `license: ${yamlScalar(meta.license)}`,
      ];
      put("openpackage.yml", `${lines.join("\n")}\n`);
      put("README.md", readme("OpenPackage package"));
      for (const [rel, text] of skills) put(`skills/${rel}`, text);
      break;
    }
    case "skills": {
      put("README.md", readme("plain skills directory"));
      for (const [rel, text] of skills) put(rel, text);
      break;
    }
  }
  return files;
}

/** Generates every package in memory from the canonical skills, advisor resource and batch extension; writes nothing. */
export function materialize(root: string): Materialization {
  const meta = readMeta(root);
  const skills = readSkills(root);
  const guidance = readGuidance(root);
  const orchestration = lf(readFileSync(join(root, ORCHESTRATION_SOURCE), "utf8"));
  const packages = new Map<PackageId, Files>();
  const files = new Map<string, Buffer>();
  for (const id of PACKAGE_IDS) {
    const generated = generatePackage(id, meta, skills, guidance, orchestration);
    packages.set(id, generated);
    for (const [rel, bytes] of generated) files.set(`${id}/${rel}`, bytes);
  }
  return { packages, files };
}

/** The manifest text of one generation: `<package>/<relative path>` to lower-case SHA-256, keys sorted. */
export function manifestText(materialization: Materialization): string {
  const record: Record<string, string> = {};
  for (const key of [...materialization.files.keys()].sort(compare)) {
    const bytes = materialization.files.get(key);
    if (bytes !== undefined) record[key] = sha256(bytes);
  }
  return `${JSON.stringify({ packages: record }, null, 2)}\n`;
}

/** Reads the tracked manifest; throws when it is missing or malformed. */
export function readManifest(root: string): Map<string, string> {
  const path = join(root, MANIFEST_PATH);
  if (!existsSync(path)) throw new Error(`${MANIFEST_PATH} is missing`);
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("packages" in parsed)) throw new Error(`${MANIFEST_PATH} has no packages object`);
  const record = parsed.packages;
  if (typeof record !== "object" || record === null) throw new Error(`${MANIFEST_PATH} has no packages object`);
  const manifest = new Map<string, string>();
  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== "string") throw new Error(`${MANIFEST_PATH}: ${key} is not a hash string`);
    manifest.set(key, value);
  }
  return manifest;
}

/**
 * The generated files the manifest does not match: `missing <key>` for a generated file the manifest does
 * not record, `stale <key>` for one whose recorded hash differs, `extra <key>` for a recorded file the
 * generation no longer produces. Sorted by code unit.
 */
export function manifestFindings(manifest: ReadonlyMap<string, string>, materialization: Materialization): string[] {
  const findings: string[] = [];
  for (const [key, bytes] of materialization.files) {
    const recorded = manifest.get(key);
    if (recorded === undefined) findings.push(`missing ${key}`);
    else if (recorded !== sha256(bytes)) findings.push(`stale ${key}`);
  }
  for (const key of manifest.keys()) if (!materialization.files.has(key)) findings.push(`extra ${key}`);
  return findings.sort(compare);
}

/** Entries directly under packages/ that belong to no generated package. */
function strayEntries(packagesDir: string): string[] {
  if (!existsSync(packagesDir)) return [];
  const known: readonly string[] = PACKAGE_IDS;
  return readdirSync(packagesDir).filter((name) => !known.includes(name)).sort(compare);
}

/**
 * The built files under packages/ that differ from the generation: `missing <key>`, `stale <key>` or
 * `extra <key>`. Empty where packages/ does not exist, so a fresh checkout verifies without a build.
 */
export function diskFindings(root: string, materialization: Materialization): string[] {
  const packagesDir = join(root, PACKAGES_DIR);
  if (!existsSync(packagesDir)) return [];
  const findings: string[] = [];
  for (const [key, bytes] of materialization.files) {
    const path = join(packagesDir, key);
    if (!existsSync(path)) findings.push(`missing ${key}`);
    else if (!readFileSync(path).equals(bytes)) findings.push(`stale ${key}`);
  }
  for (const id of PACKAGE_IDS) {
    for (const rel of listFiles(join(packagesDir, id))) {
      if (!materialization.files.has(`${id}/${rel}`)) findings.push(`extra ${id}/${rel}`);
    }
  }
  for (const name of strayEntries(packagesDir)) findings.push(`extra ${PACKAGES_DIR}/${name}`);
  return findings.sort(compare);
}

function pruneEmptyDirs(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = join(dir, entry.name);
    pruneEmptyDirs(child);
    if (readdirSync(child).length === 0) rmdirSync(child);
  }
}

function writePackage(dir: string, expected: Files): void {
  for (const rel of listFiles(dir)) if (!expected.has(rel)) rmSync(join(dir, rel));
  for (const [rel, bytes] of expected) {
    const path = join(dir, rel);
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path) || !readFileSync(path).equals(bytes)) writeFileSync(path, bytes);
  }
  pruneEmptyDirs(dir);
}

/** Writes the three packages and the tracked manifest; the only writer of the generated tree. */
export function writePackages(root: string, materialization: Materialization): void {
  const packagesDir = join(root, PACKAGES_DIR);
  for (const id of PACKAGE_IDS) {
    const expected = materialization.packages.get(id);
    if (expected === undefined) throw new Error(`no generation for ${id}`);
    writePackage(join(packagesDir, id), expected);
  }
  for (const name of strayEntries(packagesDir)) rmSync(join(packagesDir, name), { recursive: true });
  const manifestPath = join(root, MANIFEST_PATH);
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, manifestText(materialization));
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The exit status of one generator run; writes the packages and the manifest, or verifies both. */
export function main(argv: readonly string[]): number {
  const unknown = argv.filter((arg) => arg !== "--verify");
  if (unknown.length > 0) {
    console.error(`usage: bun src/tools/package.ts [--verify] (unknown argument: ${unknown.join(" ")})`);
    return 2;
  }
  const verify = argv.includes("--verify");
  const root = resolve(import.meta.dir, "..", "..");
  const materialization = materialize(root);
  let failed = false;

  if (!verify) {
    writePackages(root, materialization);
    for (const id of PACKAGE_IDS) console.log(`wrote ${PACKAGES_DIR}/${id} (${String(materialization.packages.get(id)?.size ?? 0)} files)`);
    console.log(`wrote ${MANIFEST_PATH} (${String(materialization.files.size)} files)`);
  } else {
    const findings = [...manifestFindings(readManifest(root), materialization), ...diskFindings(root, materialization)];
    for (const finding of findings) console.log(finding);
    if (findings.length === 0) console.log(`ok packages (${String(materialization.files.size)} files)`);
    failed = findings.length > 0;
  }

  const referencePath = join(root, CLI_REFERENCE_PATH);
  try {
    const reference = Buffer.from(generateCliReference(root), "utf8");
    if (!verify) {
      writeFileSync(referencePath, reference);
      console.log(`wrote ${CLI_REFERENCE_PATH}`);
    } else if (existsSync(referencePath) && readFileSync(referencePath).equals(reference)) {
      console.log("ok cli-reference");
    } else {
      console.log("drift cli-reference");
      failed = true;
    }
  } catch (error) {
    // The reference cannot be generated: never write a partial file, and never report it as verified.
    if (verify) console.log("drift cli-reference");
    console.error(`cli-reference: ${message(error)}`);
    failed = true;
  }

  return failed ? 1 : 0;
}

if (import.meta.main) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(`package: ${message(error)}`);
    process.exit(1);
  }
}
