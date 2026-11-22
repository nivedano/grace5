import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ARCH, CLI } from "./helper";

test("schema locates shipped XSDs from a client directory and rejects unsupported names", () => {
  const client = mkdtempSync(join(tmpdir(), "grace5-schema-client-"));
  const invoke = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd: client, encoding: "utf8" });
  try {
    expect(invoke("--help").stdout).toContain("grace5 schema <name>");
    for (const name of ["contract", "approval", "run", "review", "close", "common"]) {
      const result = invoke("schema", name);
      expect(result.status).toBe(0);
      const file = result.stdout.trim();
      expect(file).toBe(realpathSync(join(ARCH, "schemas", name + ".xsd")));
      expect(readFileSync(file, "utf8")).toContain("<xs:schema");
    }
    for (const args of [[], ["unknown"], ["../review"], ["review", "run"]]) {
      expect(invoke("schema", ...args).status).toBe(2);
    }
  } finally {
    rmSync(client, { recursive: true });
  }
}, 30000);
