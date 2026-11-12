// XSD validation against the published schema files, through xmllint-wasm. No rule of a schema is restated here.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateXML } from "xmllint-wasm";

export type SchemaName = "contract" | "approval" | "run" | "review" | "close";

export const SCHEMA_DIR = resolve(import.meta.dir, "..", "models", "architecture", "schemas");

const cache = new Map<string, string>();

function schemaText(file: string): string {
  let text = cache.get(file);
  if (text === undefined) {
    text = readFileSync(join(SCHEMA_DIR, file), "utf8");
    cache.set(file, text);
  }
  return text;
}

export interface SchemaInput {
  /** A plain file name such as `run-3.xml`; it labels the errors. */
  readonly fileName: string;
  readonly contents: string;
}

/** Validates several documents against one schema in one xmllint call. Returns the errors per file name; an empty list means valid. */
export async function validateMany(schema: SchemaName, inputs: readonly SchemaInput[]): Promise<Map<string, string[]>> {
  const errors = new Map<string, string[]>();
  for (const input of inputs) errors.set(input.fileName, []);
  if (inputs.length === 0) return errors;
  const result = await validateXML({
    xml: inputs.map((input) => ({ fileName: input.fileName, contents: input.contents })),
    schema: { fileName: `${schema}.xsd`, contents: schemaText(`${schema}.xsd`) },
    preload: [{ fileName: "common.xsd", contents: schemaText("common.xsd") }],
  });
  for (const error of result.errors) {
    const message = error.message.trim();
    const file = error.loc?.fileName;
    const list = file !== undefined ? errors.get(file) : undefined;
    const line = error.loc !== null ? `line ${String(error.loc.lineNumber)}: ` : "";
    if (list !== undefined) list.push(`${line}${message}`);
    else if (inputs.length === 1) errors.get(inputs[0]?.fileName ?? "")?.push(message);
    else for (const each of errors.values()) each.push(message);
  }
  if (!result.valid && result.errors.length === 0) {
    for (const each of errors.values()) each.push(result.rawOutput.trim() || "schema validation failed");
  }
  return errors;
}

export async function validateOne(schema: SchemaName, fileName: string, contents: string): Promise<string[]> {
  return (await validateMany(schema, [{ fileName, contents }])).get(fileName) ?? [];
}
