// Generates models/architecture/cli-reference.md from the help text the CLI prints.
// The CLI is run as a subprocess and never imported, so the reference shows what a user sees.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const CLI_REFERENCE_PATH = "models/architecture/cli-reference.md";

const CLI_ENTRY = "src/cli.ts";
const COMMANDS = ["init", "check", "run", "status", "close", "upgrade", "schema"] as const;

const decoder = new TextDecoder();

function normalise(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/[ \t]+$/, ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  while (lines.length > 0 && lines[0] === "") lines.shift();
  return lines.join("\n");
}

function helpText(root: string, args: readonly string[]): string {
  const shown = `grace5 ${args.join(" ")}`;
  const result = Bun.spawnSync([process.execPath, CLI_ENTRY, ...args], {
    cwd: root,
    env: { ...process.env, NO_COLOR: "1" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = normalise(decoder.decode(result.stdout));
  if (result.exitCode !== 0) {
    const err = normalise(decoder.decode(result.stderr));
    throw new Error(`\`${shown}\` exited ${String(result.exitCode)}${err === "" ? "" : `: ${err}`}`);
  }
  if (out === "") throw new Error(`\`${shown}\` printed no help text`);
  return out;
}

function fenced(text: string): string {
  let longest = 0;
  for (const match of text.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text}\n${fence}\n`;
}

/** Builds the reference text. Throws when the CLI is absent or any help invocation fails. */
export function generateCliReference(root: string): string {
  if (!existsSync(join(root, CLI_ENTRY))) throw new Error(`${CLI_ENTRY} does not exist`);
  const parts: string[] = [
    "<!-- Generated from the help text of the grace5 CLI by src/tools/cli-reference.ts. Do not edit by hand; run `bun run package`. -->\n",
    "# CLI reference\n",
    "This file is generated from the help text the CLI prints and is not edited by hand. Behaviour is stated in `commands.md`.\n",
    "## grace5\n",
    fenced(helpText(root, ["--help"])),
  ];
  for (const command of COMMANDS) {
    parts.push(`## grace5 ${command}\n`, fenced(helpText(root, [command, "--help"])));
  }
  return parts.join("\n");
}

export function writeCliReference(root: string): string {
  const text = generateCliReference(root);
  const target = join(root, CLI_REFERENCE_PATH);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
  return target;
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..", "..");
  try {
    writeCliReference(root);
    console.log(`wrote ${CLI_REFERENCE_PATH}`);
  } catch (error) {
    console.error(`cli-reference: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
