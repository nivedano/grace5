// The contract model, its validation (commands.md, check rules 1 to 4), the canonical check definitions
// and their hashes (evidence-records.md), the contract hash (authorization.md) and the size count.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { validateOne } from "./schema";
import { allText, childNamed, childrenNamed, collapse, parseXml, type XmlElement } from "./xml";

export const TARGET_WORDS = 600;
export const TARGET_CHECKS = 8;

export type CheckKind = "automated" | "trace" | "manual";
export type RequiredOrigin = "live" | "replay" | "fixture" | "any";

export interface Environment {
  readonly id: string;
  readonly device: string | undefined;
  readonly build: string | undefined;
  readonly text: string;
}

export interface Expect {
  readonly marker: string;
  readonly min: number;
  readonly max: number | undefined;
}

export interface Check {
  readonly kind: CheckKind;
  readonly id: string;
  readonly required: boolean;
  readonly environment: Environment | undefined;
  /** Automated and trace only. */
  readonly cwd: string | undefined;
  readonly budget: number | undefined;
  readonly command: string | undefined;
  /** Trace only. */
  readonly origin: RequiredOrigin | undefined;
  readonly log: string | undefined;
  readonly expects: readonly Expect[];
  readonly forbids: readonly string[];
  /** Manual only. */
  readonly procedure: string | undefined;
  readonly definition: string;
  readonly definitionSha256: string;
}

export interface Item {
  readonly id: string;
  readonly text: string;
}

export interface Contract {
  readonly id: string;
  readonly revision: number;
  readonly title: string;
  readonly constraints: readonly (Item & { readonly rule: string | undefined })[];
  readonly nonGoals: readonly Item[];
  readonly criteria: readonly (Item & { readonly checks: readonly string[] })[];
  readonly paths: readonly string[];
  readonly names: readonly string[];
  readonly protectedPaths: readonly string[];
  readonly environments: readonly Environment[];
  readonly checks: readonly Check[];
  readonly decisions: readonly Item[];
}

export interface ContractReport {
  /** SHA-256 of the contract bytes with CRLF read as LF. */
  readonly sha256: string;
  /** Present when the text validates against the schema and could be read. */
  readonly contract: Contract | undefined;
  /** Defects that make the contract invalid. */
  readonly defects: readonly string[];
  /** Checks no criterion names: reported, not invalidating. */
  readonly unused: readonly string[];
  readonly words: number;
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** authorization.md: the bytes of contract.xml with CRLF read as LF. */
export function contractSha256(bytes: Uint8Array): string {
  // latin1 maps bytes one to one, so the replacement touches only the CR LF pairs.
  return sha256Hex(Buffer.from(Buffer.from(bytes).toString("latin1").replace(/\r\n/g, "\n"), "latin1"));
}

export function xsBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const text = value.trim();
  return text === "true" || text === "1";
}

/** evidence-records.md: fields one per line as name=value, fixed order, defaults written out, whitespace collapsed. */
export function canonicalDefinition(check: Omit<Check, "definition" | "definitionSha256">): string {
  const lines: string[] = [`kind=${check.kind}`, `id=${check.id}`, `required=${String(check.required)}`];
  const add = (name: string, value: string | number | undefined): void => {
    if (value !== undefined) lines.push(`${name}=${collapse(String(value))}`);
  };
  if (check.kind !== "manual") {
    add("cwd", check.cwd ?? ".");
    add("budget", check.budget);
  }
  if (check.kind === "trace") {
    add("origin", check.origin);
    add("log", check.log);
  }
  const env = check.environment;
  if (env !== undefined) add("environment", [env.id, env.device ?? "", env.build ?? "", env.text].map(collapse).join("|"));
  if (check.kind !== "manual") add("command", check.command);
  if (check.kind === "trace") {
    for (const expect of check.expects) add("expect", `${String(expect.min)},${expect.max === undefined ? "" : String(expect.max)}|${collapse(expect.marker)}`);
    for (const forbid of check.forbids) add("forbid", forbid);
  }
  if (check.kind === "manual") add("procedure", check.procedure);
  return `${lines.join("\n")}\n`;
}

/** The declared environment identity as records carry it: id, device, build and text joined by `|`. */
export function environmentIdentity(env: Environment): string {
  return [env.id, env.device ?? "", env.build ?? "", env.text].join("|");
}

function item(element: XmlElement): Item {
  return { id: element.attributes["id"] ?? "", text: collapse(element.text) };
}

function section(root: XmlElement, name: string, child: string): readonly XmlElement[] {
  const found = childNamed(root, name);
  return found === undefined ? [] : childrenNamed(found, child);
}

function optional(element: XmlElement, name: string): string | undefined {
  const value = element.attributes[name];
  return value === undefined ? undefined : collapse(value);
}

/** Builds the model from a document that already validated against contract.xsd. */
export function buildContract(root: XmlElement): Contract {
  const checksElement = childNamed(root, "Checks");
  const environments: Environment[] = childrenNamed(checksElement ?? root, "Environment").map((e) => ({
    id: e.attributes["id"] ?? "",
    device: optional(e, "device"),
    build: optional(e, "build"),
    text: collapse(e.text),
  }));
  const checks: Check[] = [];
  for (const element of checksElement?.children ?? []) {
    if (element.name !== "Automated" && element.name !== "Trace" && element.name !== "Manual") continue;
    const kind = element.name.toLowerCase() as CheckKind;
    const environmentId = optional(element, "environment");
    const command = childNamed(element, "Command");
    const procedure = childNamed(element, "Procedure");
    const budget = element.attributes["budget"];
    const base = {
      kind,
      id: (element.attributes["id"] ?? "").trim(),
      required: xsBoolean(element.attributes["required"], true),
      environment: environments.find((e) => e.id === environmentId),
      cwd: kind === "manual" ? undefined : (optional(element, "cwd") ?? "."),
      budget: budget === undefined ? undefined : Number(budget),
      command: command === undefined ? undefined : collapse(command.text),
      origin: kind === "trace" ? (optional(element, "origin") as RequiredOrigin | undefined) : undefined,
      log: kind === "trace" ? optional(element, "log") : undefined,
      expects: childrenNamed(element, "Expect").map((e) => ({
        marker: collapse(e.text),
        min: Number(e.attributes["min"] ?? "1"),
        max: e.attributes["max"] === undefined ? undefined : Number(e.attributes["max"]),
      })),
      forbids: childrenNamed(element, "Forbid").map((e) => collapse(e.text)),
      procedure: procedure === undefined ? undefined : collapse(procedure.text),
    };
    const definition = canonicalDefinition(base);
    checks.push({ ...base, definition, definitionSha256: sha256Hex(definition) });
  }
  return {
    id: root.attributes["id"] ?? "",
    revision: Number(root.attributes["revision"] ?? "0"),
    title: collapse(root.attributes["title"] ?? ""),
    constraints: section(root, "Constraints", "Constraint").map((e) => ({ ...item(e), rule: optional(e, "rule") })),
    nonGoals: section(root, "NonGoals", "NonGoal").map(item),
    criteria: section(root, "Acceptance", "Criterion").map((e) => ({
      ...item(e),
      checks: collapse(e.attributes["checks"] ?? "").split(" ").filter((id) => id !== ""),
    })),
    paths: section(root, "Affected", "Path").map((e) => collapse(e.text)),
    names: section(root, "Affected", "Name").map((e) => collapse(e.text)),
    protectedPaths: section(root, "Affected", "Protected").map((e) => collapse(e.text)),
    environments,
    checks,
    decisions: section(root, "Decisions", "Decision").map(item),
  };
}

/** commands.md: the whitespace-separated tokens of all element text, attribute values excluded. */
export function countWords(root: XmlElement): number {
  let words = 0;
  for (const text of allText(root)) words += text.split(/\s+/).filter((token) => token !== "").length;
  return words;
}

// Globs (authorization.md): `*` within a segment, `**` across segments, a trailing `/` covers the directory.

export function globDefect(glob: string): string | undefined {
  if (glob === "") return "is empty";
  if (glob.includes("\\")) return "uses a backslash";
  if (glob.startsWith("/") || /^[A-Za-z]:/.test(glob)) return "is not relative to the repository";
  const segments = (glob.endsWith("/") ? glob.slice(0, -1) : glob).split("/");
  for (const segment of segments) {
    if (segment === "") return "has an empty segment";
    if (segment === "." || segment === "..") return `has a '${segment}' segment`;
    if (segment.includes("**") && segment !== "**") return "uses '**' inside a segment";
  }
  return undefined;
}

function globRegExp(glob: string): RegExp {
  const directory = glob.endsWith("/");
  const segments = (directory ? glob.slice(0, -1) : glob).split("/");
  let source = "^";
  segments.forEach((segment, index) => {
    const last = index === segments.length - 1;
    if (segment === "**") source += last ? ".*" : "(?:[^/]+/)*";
    else source += segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + (last ? "" : "/");
  });
  return new RegExp(directory ? `${source}/.*$` : `${source}$`);
}

export function globMatches(glob: string, path: string): boolean {
  if (globDefect(glob) !== undefined) return false;
  return globRegExp(glob).test(path);
}

export function matchesAny(globs: readonly string[], path: string): boolean {
  return globs.some((glob) => globMatches(glob, path));
}

/** Whether everything `path` could name is also named by `protectedGlob`. */
function whollyCovered(path: string, protectedGlob: string): boolean {
  if (path === protectedGlob) return true;
  if (!path.includes("*") && !path.endsWith("/")) return globMatches(protectedGlob, path);
  const base = protectedGlob.endsWith("/**") ? protectedGlob.slice(0, -2) : protectedGlob.endsWith("/") ? protectedGlob : undefined;
  return base !== undefined && !base.includes("*") && path.startsWith(base);
}

export interface ContractOptions {
  /** Repository root for the rule-path rule (check rule 3). Left out, that rule is not applied. */
  readonly root?: string;
}

/** Check rules 1 to 4 of commands.md over the bytes of a contract.xml. */
export async function readContract(bytes: Uint8Array, options: ContractOptions = {}): Promise<ContractReport> {
  const sha256 = contractSha256(bytes);
  const text = Buffer.from(bytes).toString("utf8");
  const defects: string[] = (await validateOne("contract", "contract.xml", text)).map((error) => `contract.xml: ${error}`);
  let root: XmlElement | undefined;
  try {
    root = parseXml(text);
  } catch (error) {
    if (defects.length === 0) defects.push(`contract.xml: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (root === undefined || defects.length > 0) {
    return { sha256, contract: undefined, defects, unused: [], words: root === undefined ? 0 : countWords(root) };
  }
  const contract = buildContract(root);
  const checkIds = new Set(contract.checks.map((check) => check.id));
  const served = new Set<string>();
  for (const criterion of contract.criteria) {
    for (const id of criterion.checks) {
      if (checkIds.has(id)) served.add(id);
      else defects.push(`criterion ${criterion.id} names ${id}, which is not a check`);
    }
  }
  for (const element of childNamed(root, "Checks")?.children ?? []) {
    const environment = element.name === "Environment" ? undefined : optional(element, "environment");
    if (environment !== undefined && !contract.environments.some((e) => e.id === environment)) {
      defects.push(`check ${element.attributes["id"] ?? ""} names environment ${environment}, which is not an Environment`);
    }
  }
  if (options.root !== undefined) {
    // Check rule 3: every cited rule path exists, except one under the change's own Affected, which the change may
    // create or amend, or which a closed record may cite after it was retired (commands.md).
    const own = [...contract.paths, ...contract.protectedPaths];
    for (const constraint of contract.constraints) {
      if (constraint.rule === undefined) continue;
      const path = constraint.rule.split("#")[0] ?? "";
      if (path === "") defects.push(`constraint ${constraint.id} cites rule ${constraint.rule}, which does not exist`);
      else if (!matchesAny(own, path) && !existsSync(join(options.root, path))) defects.push(`constraint ${constraint.id} cites rule ${constraint.rule}, which does not exist`);
    }
  }
  for (const glob of contract.protectedPaths) {
    const defect = globDefect(glob);
    if (defect !== undefined) defects.push(`protected path ${glob} ${defect}`);
  }
  for (const path of contract.paths) {
    const cover = contract.protectedPaths.find((glob) => globDefect(glob) === undefined && whollyCovered(path, glob));
    if (cover !== undefined) defects.push(`path ${path} is wholly covered by protected path ${cover}`);
  }
  const unused = contract.checks.filter((check) => !served.has(check.id)).map((check) => check.id);
  return { sha256, contract, defects, unused, words: countWords(root) };
}
