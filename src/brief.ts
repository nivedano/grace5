// The mechanical fidelity rules of brief.md. The brief is HTML and has no schema, so this reads only what the
// rules name: the meta elements, the data- attributes, the limitation cell of an evidence row and the exclusion items.

import type { Contract } from "./contract";

export interface BriefRow {
  readonly check: string;
  readonly kind: string;
  readonly required: string;
  readonly limitation: string;
}

export interface Brief {
  readonly meta: ReadonlyMap<string, string>;
  readonly rows: readonly BriefRow[];
  readonly protectedPaths: readonly string[];
  readonly decisions: readonly string[];
  readonly findings: readonly string[];
  readonly exclusions: number;
}

interface Tag {
  readonly name: string;
  readonly closing: boolean;
  readonly attributes: ReadonlyMap<string, string>;
  readonly start: number;
  readonly end: number;
}

const TAG = /<(\/?)([A-Za-z][A-Za-z0-9:-]*)((?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>]+))?)*)\s*\/?>/g;
const ATTRIBUTE = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+)))?/g;

function decode(text: string): string {
  return text
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

function tags(html: string): Tag[] {
  const found: Tag[] = [];
  for (const match of html.matchAll(TAG)) {
    const attributes = new Map<string, string>();
    for (const attribute of (match[3] ?? "").matchAll(ATTRIBUTE)) {
      const name = (attribute[1] ?? "").toLowerCase();
      if (!attributes.has(name)) attributes.set(name, decode(attribute[2] ?? attribute[3] ?? attribute[4] ?? ""));
    }
    found.push({ name: (match[2] ?? "").toLowerCase(), closing: match[1] === "/", attributes, start: match.index, end: match.index + match[0].length });
  }
  return found;
}

function hasClass(tag: Tag, name: string): boolean {
  return (tag.attributes.get("class") ?? "").split(/\s+/).includes(name);
}

function visibleText(html: string): string {
  return decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

export function readBrief(source: string): Brief {
  // Comments, styles and scripts are not content: the template's style block itself mentions data-finding=open.
  const html = source.replace(/<!--[\s\S]*?-->/g, "").replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, "");
  const all = tags(html);
  const meta = new Map<string, string>();
  const rows: BriefRow[] = [];
  const protectedPaths: string[] = [];
  const decisions: string[] = [];
  const findings: string[] = [];
  let exclusions = 0;
  let exclusionDepth = 0;

  for (let i = 0; i < all.length; i++) {
    const tag = all[i];
    if (tag === undefined) continue;
    if (tag.name === "ul") {
      if (exclusionDepth > 0) exclusionDepth += tag.closing ? -1 : 1;
      else if (!tag.closing && hasClass(tag, "exclusions")) exclusionDepth = 1;
      continue;
    }
    if (tag.closing) continue;
    if (tag.name === "li" && exclusionDepth === 1) exclusions++;
    if (tag.name === "meta") {
      const name = tag.attributes.get("name");
      if (name !== undefined && name.startsWith("grace5:") && !meta.has(name)) meta.set(name, (tag.attributes.get("content") ?? "").trim());
    }
    const protectedPath = tag.attributes.get("data-protected");
    if (protectedPath !== undefined) protectedPaths.push(protectedPath.trim());
    const decision = tag.attributes.get("data-decision");
    if (decision !== undefined) decisions.push(decision.trim());
    const finding = tag.attributes.get("data-finding");
    if (finding !== undefined) findings.push(finding.trim());
    const check = tag.attributes.get("data-check");
    if (check !== undefined) {
      // The row runs to its closing tag; the limitation is the cell of class `limits`, or the third cell.
      let rowEnd = all.length;
      for (let j = i + 1; j < all.length; j++) {
        const other = all[j];
        if (other !== undefined && other.name === tag.name && (other.closing || other.attributes.has("data-check"))) {
          rowEnd = j;
          break;
        }
      }
      const cells: { tag: Tag; text: string }[] = [];
      for (let j = i + 1; j < rowEnd; j++) {
        const open = all[j];
        if (open === undefined || open.closing || open.name !== "td") continue;
        let close = rowEnd;
        for (let k = j + 1; k < rowEnd; k++) {
          const other = all[k];
          if (other !== undefined && other.name === "td") {
            close = k;
            break;
          }
        }
        const closeTag = all[close];
        cells.push({ tag: open, text: visibleText(html.slice(open.end, closeTag === undefined ? html.length : closeTag.start)) });
      }
      const limits = cells.find((cell) => hasClass(cell.tag, "limits")) ?? cells[2];
      rows.push({
        check: check.trim(),
        kind: (tag.attributes.get("data-kind") ?? "").trim(),
        required: (tag.attributes.get("data-required") ?? "").trim(),
        limitation: limits?.text ?? "",
      });
    }
  }
  return { meta, rows, protectedPaths, decisions, findings, exclusions };
}

export interface BriefBasis {
  readonly contract: Contract;
  readonly sha256: string;
  readonly words: number;
}

/** Every mechanical defect of a brief against the contract, each naming the omitted item. Empty when the brief is faithful. */
export function briefDefects(brief: Brief, basis: BriefBasis): string[] {
  const { contract } = basis;
  const defects: string[] = [];
  const hash = brief.meta.get("grace5:contract-sha256");
  if (hash === undefined) defects.push("meta grace5:contract-sha256 is missing");
  else if (hash !== basis.sha256) defects.push(`grace5:contract-sha256 is ${hash}, the contract is ${basis.sha256}`);

  for (const check of contract.checks) {
    const rows = brief.rows.filter((row) => row.check === check.id);
    const row = rows[0];
    if (row === undefined) {
      defects.push(`evidence row for check ${check.id} is missing`);
      continue;
    }
    if (rows.length > 1) defects.push(`check ${check.id} has ${String(rows.length)} evidence rows`);
    if (row.kind !== check.kind) defects.push(`evidence row ${check.id} says kind ${row.kind || "nothing"}, the contract says ${check.kind}`);
    if (row.required !== String(check.required)) defects.push(`evidence row ${check.id} says required ${row.required || "nothing"}, the contract says ${String(check.required)}`);
    if (check.kind !== "automated" && row.limitation === "") defects.push(`limitation of ${check.kind} check ${check.id} is missing`);
  }
  for (const path of contract.protectedPaths) {
    if (!brief.protectedPaths.includes(path)) defects.push(`protected path ${path} is missing`);
  }
  if (brief.exclusions < contract.nonGoals.length) {
    defects.push(`${String(brief.exclusions)} exclusion items for ${String(contract.nonGoals.length)} NonGoals`);
  }
  for (const decision of contract.decisions) {
    if (!brief.decisions.includes(decision.id)) defects.push(`decision ${decision.id} is missing`);
  }
  const counted: readonly (readonly [string, number])[] = [["grace5:words", basis.words], ["grace5:checks", contract.checks.length]];
  for (const [name, count] of counted) {
    const stated = brief.meta.get(name);
    if (stated === undefined) defects.push(`meta ${name} is missing`);
    else if (stated !== String(count)) defects.push(`${name} is ${stated}, check counts ${String(count)}`);
  }
  const open = brief.findings.filter((finding) => finding === "open").length;
  if (open > 0) defects.push(`${String(open)} finding${open === 1 ? " is" : "s are"} open`);
  return defects;
}
