// Verifies the upgrade on a clone of this repository at the tag of the previous version (CK6 of C-0004-upgrade-command):
// the clone has no pin, so it reads as 0.1.0 and the whole chain runs; afterwards it must carry the kernel's version,
// list the same changes as closed, and report the same contract and definition hashes as before.
// The hashes before the upgrade are read with the kernel's own reader, because `check` refuses a stale pin.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { kernelVersion } from "../records";
import { snapshot, snapshotDifference } from "../upgrade/chain";
import { PIN_PATH, UNPINNED_VERSION } from "../upgrade/pin";
import { CLOSED_LOGS_IGNORE } from "../upgrade/steps";

const ROOT = resolve(import.meta.dir, "..", "..");
const CLI = join(ROOT, "src", "cli.ts");
const TAG = "v0.2.0";

interface Output {
  readonly code: number;
  readonly lines: string[];
  readonly text: string;
}

function git(cwd: string, args: readonly string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${(result.stderr ?? "").trim()}`);
}

function kernel(root: string, args: readonly string[]): Output {
  const result = spawnSync(process.execPath, [CLI, "--root", root, ...args], { encoding: "utf8", windowsHide: true, cwd: ROOT });
  const text = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { code: result.status ?? -1, lines: text.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line !== ""), text };
}

async function main(): Promise<number> {
  const failures: string[] = [];
  const ok = (what: string): void => console.log(`ok ${what}`);
  const fail = (what: string): void => {
    failures.push(what);
    console.log(`difference: ${what}`);
  };
  const tmp = mkdtempSync(join(tmpdir(), "grace5-upgrade-"));
  const clone = join(tmp, "clone");
  try {
    git(ROOT, ["clone", "-q", "--no-local", "-c", "core.autocrlf=false", ROOT, clone]);
    git(clone, ["-c", "advice.detachedHead=false", "checkout", "-q", TAG]);
    ok(`cloned ${TAG}`);
    if (existsSync(join(clone, PIN_PATH))) fail(`${TAG} carries a pin; this tool expects the unpinned state`);

    const before = await snapshot(clone);
    if (before.size === 0) fail(`no change found in the clone at ${TAG}`);
    for (const [id, state] of before) ok(`before: ${id} contract ${state.contractSha256 ?? "unreadable"}, ${String(state.definitions.size)} definitions, ${String(state.defects.length)} defects`);

    const version = kernelVersion();
    const upgrade = kernel(clone, ["upgrade"]);
    console.log(upgrade.text.trimEnd());
    const expected = `upgraded: ${UNPINNED_VERSION} -> ${version}`;
    if (upgrade.code === 0 && upgrade.lines.includes(expected)) ok(expected);
    else fail(`upgrade exited ${String(upgrade.code)} without the line ${expected}`);

    const pinFile = join(clone, PIN_PATH);
    const pin = existsSync(pinFile) ? readFileSync(pinFile, "utf8") : undefined;
    if (pin === `${version}\n`) ok(`pin ${PIN_PATH} reads ${version}`);
    else fail(`pin reads ${JSON.stringify(pin ?? "nothing")}, expected ${JSON.stringify(`${version}\n`)}`);

    const ignore = existsSync(join(clone, ".gitignore")) ? readFileSync(join(clone, ".gitignore"), "utf8").split(/\r?\n/) : [];
    const count = ignore.filter((line) => line.trim() === CLOSED_LOGS_IGNORE).length;
    if (count === 1) ok(`.gitignore carries ${CLOSED_LOGS_IGNORE} once`);
    else fail(`.gitignore carries ${CLOSED_LOGS_IGNORE} ${String(count)} times`);

    const status = kernel(clone, ["status", "--all"]);
    if (status.code !== 0) fail(`status --all exited ${String(status.code)}: ${status.text}`);
    for (const id of before.keys()) {
      if (status.lines.includes(`${id}: closed`)) ok(`status lists ${id} as closed`);
      else fail(`status does not list ${id} as closed`);
    }
    const stray = status.lines.filter((line) => /^C-[0-9]{4}/.test(line) && !before.has(line.split(":")[0] ?? ""));
    for (const line of stray) fail(`status lists a change that was not there before: ${line}`);
    const counted = `closed changes: ${String(before.size)}`;
    if (status.lines.at(-1) === counted) ok(counted);
    else fail(`status ends with ${status.lines.at(-1) ?? "nothing"}, expected ${counted}`);
    const kernelLine = `kernel: ${version}, state: ${version}`;
    if (status.lines[0] === kernelLine) ok(kernelLine);
    else fail(`status starts with ${status.lines[0] ?? "nothing"}, expected ${kernelLine}`);

    const after = await snapshot(clone);
    const difference = snapshotDifference(before, after);
    if (difference === undefined) ok(`hashes and defects of ${String(before.size)} changes unchanged`);
    else fail(difference);

    const again = kernel(clone, ["upgrade"]);
    if (again.code === 0 && again.lines.includes(`up to date: ${version}`)) ok(`second upgrade: up to date: ${version}`);
    else fail(`second upgrade exited ${String(again.code)}: ${again.text}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
  if (failures.length > 0) console.log(`failed: ${String(failures.length)} difference(s)`);
  return failures.length === 0 ? 0 : 1;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`upgrade-verify: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
