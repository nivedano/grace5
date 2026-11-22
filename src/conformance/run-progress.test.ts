import { afterAll, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { disposeAll, CLI, killTree, prepared, trace, waitFor, TEST_TIMEOUT } from "./helper";

afterAll(disposeAll);

test("run streams check progress before publishing its final summary", async () => {
  const s = prepared({
    id: "C-0101-progress",
    checks: [
      trace("SLOW", "bun tools/sleep.js 20", "any", { expect: ["MARK-A"] }),
      trace("NEXT", "bun tools/sleep.js 2", "any", { expect: ["MARK-A"] }),
    ],
  });
  const child = spawn(process.execPath, [CLI, "--root", s.repo, "run", s.id, "--start", "--check", "SLOW", "NEXT"], {
    cwd: s.scratch, stdio: ["ignore", "pipe", "inherit"], detached: process.platform !== "win32", windowsHide: true,
  });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { output += chunk; });
  const closed = new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  try {
    expect(await waitFor(() => output.includes("run 1: SLOW starting"), 5000)).toBe(true);
    expect(output.trimEnd().split(/\r?\n/)).toEqual(["logs: records/logs/run-1/", "run 1: SLOW starting"]);
    expect(await waitFor(() => output.includes("run 1: SLOW passed"), 45000)).toBe(true);
    expect(s.hasRecord("run-1.xml")).toBe(false);
    expect(await closed).toBe(0);
    expect(output.trimEnd().split(/\r?\n/).slice(-5)).toEqual([
      "run 1: NEXT starting", "run 1: NEXT passed", "run 1: SLOW passed", "run 1: NEXT passed",
      `receipt: .grace5/changes/${s.id}/records/run-1.xml`,
    ]);
  } finally {
    if (child.exitCode === null && child.signalCode === null) await killTree(child);
  }
}, TEST_TIMEOUT);
