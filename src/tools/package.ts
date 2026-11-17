// Generates the three harness packages under packages/ from the canonical skills in skills/ and the
// advisor guidance resource in models/architecture/, and models/architecture/cli-reference.md from the
// CLI help text. `--verify` regenerates in memory and compares byte for byte with what is on disk.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CLI_REFERENCE_PATH, generateCliReference } from "./cli-reference";

const PACKAGES_DIR = "packages";
const SKILLS_DIR = "skills";
const PACKAGE_NAME = "grace5";
const PACKAGE_IDS = ["claude-plugin", "openpackage", "skills"] as const;
type PackageId = (typeof PACKAGE_IDS)[number];

/** The advisor guidance resource: the maintained source and where each generated package ships it. */
const GUIDANCE_SOURCE = "models/architecture/advisor-guidance.md";
const GUIDANCE_TARGET = "advisor-guidance.md";

type Files = Map<string, Buffer>;

interface Meta {
  description: string;
  version: string;
  license: string;
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

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

function generatePackage(id: PackageId, meta: Meta, skills: Map<string, string>, guidance: string): Files {
  const files: Files = new Map();
  const put = (path: string, text: string): void => {
    files.set(path, Buffer.from(lf(text), "utf8"));
  };
  put(GUIDANCE_TARGET, guidance);
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

/** Files of one package that differ from the generation: missing, changed or extra. */
function driftOf(dir: string, expected: Files): string[] {
  const drifted = new Set<string>();
  for (const [rel, bytes] of expected) {
    const path = join(dir, rel);
    if (!existsSync(path) || !readFileSync(path).equals(bytes)) drifted.add(rel);
  }
  for (const rel of listFiles(dir)) if (!expected.has(rel)) drifted.add(rel);
  return [...drifted].sort(compare);
}

/** Entries directly under packages/ that belong to no generated package. */
function strayEntries(packagesDir: string): string[] {
  if (!existsSync(packagesDir)) return [];
  const known: readonly string[] = PACKAGE_IDS;
  return readdirSync(packagesDir).filter((name) => !known.includes(name)).sort(compare);
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

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function main(argv: readonly string[]): number {
  const unknown = argv.filter((arg) => arg !== "--verify");
  if (unknown.length > 0) {
    console.error(`usage: bun src/tools/package.ts [--verify] (unknown argument: ${unknown.join(" ")})`);
    return 2;
  }
  const verify = argv.includes("--verify");
  const root = resolve(import.meta.dir, "..", "..");
  const packagesDir = join(root, PACKAGES_DIR);
  const meta = readMeta(root);
  const skills = readSkills(root);
  const guidance = readGuidance(root);
  let failed = false;

  for (const id of PACKAGE_IDS) {
    const expected = generatePackage(id, meta, skills, guidance);
    const dir = join(packagesDir, id);
    if (!verify) {
      writePackage(dir, expected);
      console.log(`wrote ${PACKAGES_DIR}/${id} (${String(expected.size)} files)`);
      continue;
    }
    const drifted = driftOf(dir, expected);
    if (drifted.length === 0) console.log(`ok ${id}`);
    for (const rel of drifted) console.log(`drift ${id}: ${rel}`);
    if (drifted.length > 0) failed = true;
  }

  // Anything else directly under packages/ is not something the generator produces.
  for (const name of strayEntries(packagesDir)) {
    if (verify) {
      console.log(`drift ${PACKAGES_DIR}: ${name}`);
      failed = true;
    } else {
      rmSync(join(packagesDir, name), { recursive: true });
      console.log(`removed ${PACKAGES_DIR}/${name}`);
    }
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

try {
  process.exit(main(process.argv.slice(2)));
} catch (error) {
  console.error(`package: ${message(error)}`);
  process.exit(1);
}
