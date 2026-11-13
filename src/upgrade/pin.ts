// The version pin (upgrade.md): .grace5/kernel-version holds the version the state conforms to.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PIN_PATH } from "../git";
import { kernelVersion } from "../records";

export { PIN_PATH };
/** What a missing pin reads as where .grace5/ exists: the version before the pin existed. */
export const UNPINNED_VERSION = "0.1.0";

const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/;

export function isVersion(text: string): boolean {
  return VERSION.test(text);
}

/** Negative, zero or positive as `a` is before, equal to or after `b`; dotted numeric parts. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** The pinned version; 0.1.0 where .grace5/ exists without a pin; undefined where there is no .grace5/. Throws on a pin that is not a version. */
export function readPin(root: string): string | undefined {
  if (!existsSync(join(root, ".grace5"))) return undefined;
  const file = join(root, PIN_PATH);
  if (!existsSync(file)) return UNPINNED_VERSION;
  const text = readFileSync(file, "utf8").trim();
  if (!isVersion(text)) throw new Error(`${PIN_PATH} is not a version: ${text === "" ? "empty" : text}`);
  return text;
}

/** One line, the version, LF. */
export function writePin(root: string, version: string): void {
  const file = join(root, PIN_PATH);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${version}\n`);
}

/** The fixed phrase of commands.md for a pin that cannot be read as a version. */
export function unreadablePin(error: unknown): string {
  return `repository pin is unreadable: ${error instanceof Error ? error.message : String(error)}`;
}

/** The refusal of commands.md when the pin differs from the running kernel or cannot be read, or undefined when a command may proceed. */
export function pinRefusal(root: string): string | undefined {
  let pin: string | undefined;
  try {
    pin = readPin(root);
  } catch (error) {
    return unreadablePin(error);
  }
  if (pin === undefined) return undefined;
  const version = kernelVersion();
  const order = compareVersions(pin, version);
  if (order === 0) return undefined;
  return `repository state is at ${pin}, kernel is ${version}: ${order < 0 ? "run grace5 upgrade" : "kernel too old"}`;
}
