// A small strict XML reader and writer. It covers what the GRACE 5 records use and nothing else:
// elements, attributes, text, the predefined and numeric entities, comments and the XML declaration.

export interface XmlElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlElement[];
  /** Concatenated character data directly inside this element, entities decoded, whitespace as written. */
  readonly text: string;
}

const ENTITIES: Readonly<Record<string, string>> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const NAME = /[A-Za-z_][A-Za-z0-9_.\-]*/y;

export class XmlError extends Error {}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

export function decodeEntities(raw: string, fail: (message: string) => never): string {
  return raw.replace(/&([^;&<]*);?/g, (whole, body: string) => {
    if (!whole.endsWith(";")) fail("unterminated entity reference");
    const named = ENTITIES[body];
    if (named !== undefined) return named;
    const numeric = /^#(?:x([0-9A-Fa-f]+)|([0-9]+))$/.exec(body);
    if (numeric === null) fail(`unknown entity &${body};`);
    const code = numeric[1] !== undefined ? parseInt(numeric[1], 16) : parseInt(numeric[2] ?? "", 10);
    if (!(code > 0 && code <= 0x10ffff)) fail(`invalid character reference &${body};`);
    return String.fromCodePoint(code);
  });
}

/** Parses a document. Line endings are normalised to LF first, as XML requires. Throws XmlError. */
export function parseXml(input: string): XmlElement {
  const source = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  let pos = 0;

  const fail = (message: string): never => {
    throw new XmlError(`line ${String(lineOf(source, pos))}: ${message}`);
  };
  const skipSpace = (): void => {
    while (pos < source.length && /\s/.test(source[pos] ?? "")) pos++;
  };
  const readName = (): string => {
    NAME.lastIndex = pos;
    const match = NAME.exec(source);
    if (match === null) return fail("a name was expected");
    pos += match[0].length;
    return match[0];
  };
  const skipComment = (): void => {
    const end = source.indexOf("-->", pos + 4);
    if (end < 0) fail("unterminated comment");
    if (source.slice(pos + 4, end).includes("--")) fail("'--' inside a comment");
    pos = end + 3;
  };
  const skipMisc = (): void => {
    for (;;) {
      skipSpace();
      if (source.startsWith("<!--", pos)) skipComment();
      else return;
    }
  };

  const readElement = (): XmlElement => {
    pos++; // "<"
    const name = readName();
    const attributes: Record<string, string> = {};
    for (;;) {
      const before = pos;
      skipSpace();
      const next = source[pos];
      if (next === ">" || next === "/") break;
      if (next === undefined) fail(`unterminated start tag <${name}>`);
      if (pos === before) fail("whitespace was expected before an attribute");
      const attribute = readName();
      skipSpace();
      if (source[pos] !== "=") fail(`'=' was expected after attribute ${attribute}`);
      pos++;
      skipSpace();
      const quote = source[pos];
      if (quote !== '"' && quote !== "'") fail(`attribute ${attribute} needs a quoted value`);
      const close = source.indexOf(quote ?? '"', pos + 1);
      if (close < 0) fail(`unterminated value of attribute ${attribute}`);
      const raw = source.slice(pos + 1, close);
      if (raw.includes("<")) fail(`'<' inside the value of attribute ${attribute}`);
      if (attribute in attributes) fail(`attribute ${attribute} is repeated`);
      // Attribute value normalisation: literal whitespace characters become spaces.
      attributes[attribute] = decodeEntities(raw.replace(/[\t\n]/g, " "), fail);
      pos = close + 1;
    }
    if (source[pos] === "/") {
      if (source[pos + 1] !== ">") fail("'>' was expected after '/'");
      pos += 2;
      return { name, attributes, children: [], text: "" };
    }
    pos++; // ">"
    const children: XmlElement[] = [];
    let text = "";
    for (;;) {
      const open = source.indexOf("<", pos);
      if (open < 0) {
        pos = source.length;
        return fail(`element <${name}> is not closed`);
      }
      const chunk = source.slice(pos, open);
      if (chunk.includes("]]>")) fail("']]>' in character data");
      text += decodeEntities(chunk, fail);
      pos = open;
      if (source.startsWith("<!--", pos)) skipComment();
      else if (source.startsWith("</", pos)) {
        pos += 2;
        const closing = readName();
        if (closing !== name) fail(`</${closing}> closes <${name}>`);
        skipSpace();
        if (source[pos] !== ">") fail(`'>' was expected in </${closing}>`);
        pos++;
        return { name, attributes, children, text };
      } else if (source.startsWith("<!", pos) || source.startsWith("<?", pos)) {
        fail("CDATA sections, processing instructions and declarations are not supported");
      } else children.push(readElement());
    }
  };

  if (source.startsWith("<?xml", pos)) {
    const end = source.indexOf("?>", pos);
    if (end < 0) fail("unterminated XML declaration");
    const encoding = /encoding\s*=\s*["']([^"']*)["']/.exec(source.slice(pos, end));
    if (encoding !== null && !/^utf-?8$/i.test(encoding[1] ?? "")) fail("only UTF-8 documents are supported");
    pos = end + 2;
  }
  skipMisc();
  if (source[pos] !== "<" || source.startsWith("<!", pos) || source.startsWith("<?", pos)) fail("a root element was expected");
  const root = readElement();
  skipMisc();
  if (pos < source.length) fail("content after the root element");
  return root;
}

/** The XSD `collapse` whitespace facet: trimmed, inner runs reduced to one space. */
export function collapse(value: string): string {
  return value.replace(/[ \t\n\r]+/g, " ").trim();
}

export function childrenNamed(element: XmlElement, name: string): readonly XmlElement[] {
  return element.children.filter((child) => child.name === name);
}

export function childNamed(element: XmlElement, name: string): XmlElement | undefined {
  return element.children.find((child) => child.name === name);
}

/** Every text node of the tree in document order is covered by concatenating `text` of each element. */
export function allText(element: XmlElement): string[] {
  const out: string[] = [element.text];
  for (const child of element.children) out.push(...allText(child));
  return out;
}

// Writer.

export interface XmlNode {
  readonly name: string;
  readonly attributes?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly children?: readonly XmlNode[];
  /** Written exactly as given (escaped, never indented or trimmed). Excludes children. */
  readonly text?: string;
}

function stripInvalid(value: string): string {
  // Characters XML 1.0 cannot carry, even escaped.
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");
}

export function escapeText(value: string): string {
  return stripInvalid(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#13;");
}

export function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;").replace(/\n/g, "&#10;").replace(/\t/g, "&#9;");
}

function writeNode(node: XmlNode, depth: number, out: string[]): void {
  const pad = "  ".repeat(depth);
  let open = `${pad}<${node.name}`;
  for (const [key, value] of Object.entries(node.attributes ?? {})) {
    if (value !== undefined) open += ` ${key}="${escapeAttribute(String(value))}"`;
  }
  const children = node.children ?? [];
  if (node.text !== undefined) out.push(`${open}>${escapeText(node.text)}</${node.name}>`);
  else if (children.length === 0) out.push(`${open}/>`);
  else {
    out.push(`${open}>`);
    for (const child of children) writeNode(child, depth + 1, out);
    out.push(`${pad}</${node.name}>`);
  }
}

export function writeXml(root: XmlNode): string {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>'];
  writeNode(root, 0, out);
  return `${out.join("\n")}\n`;
}
