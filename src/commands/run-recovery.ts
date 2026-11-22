import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Hex } from "../contract";
import { readReservation, runNode, writeRecord, type RunRecord, type RunReservation, type RunResult } from "../records";
import { validateOne } from "../schema";
import type { ChangeState } from "../state";
import { parseXml } from "../xml";

const HEADER = "run-header.xml";

// Keep conventional names when they are unambiguous across supported filesystems.
export function runLogs(n: number, ids: readonly string[]): { saved: string; output: string }[] {
  const names = ids.flatMap(id => [id + ".log", id + ".output.log"].map(name => name.toLowerCase()));
  const indexed = new Set(names).size !== names.length || ids.some(id => /[^A-Za-z0-9_.-]/.test(id));
  const base = `records/logs/run-${String(n)}`;
  return ids.map((id, index) => indexed
    ? { saved: `${base}/checks/${String(index + 1)}/check.log`, output: `${base}/checks/${String(index + 1)}/output.log` }
    : { saved: `${base}/${id}.log`, output: `${base}/${id}.output.log` });
}

// SQLite holds the OS lock until close or process death. Keep the file so every contender locks the same inode.
function acquireRunLock(dir: string, create: boolean): Database | undefined {
  const db = new Database(dir + ".owner.sqlite", { readwrite: true, create });
  try {
    db.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE");
    return db;
  } catch (error) {
    db.close();
    if ((error as { code?: string }).code === "SQLITE_BUSY") return undefined;
    throw error;
  }
}

export function reserveRun(logs: string, first: number): { dir: string; n: number; lock: Database } {
  mkdirSync(logs, { recursive: true });
  for (let n = first; ; n++) {
    const dir = join(logs, `run-${String(n)}`);
    const lock = acquireRunLock(dir, true);
    if (!lock) continue;
    try {
      mkdirSync(dir);
      return { dir, n, lock };
    } catch (error) {
      lock.close();
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
}

export async function saveHeader(dir: string, reservation: RunReservation): Promise<void> {
  const temporary = join(dir, HEADER + ".tmp");
  await writeRecord("run-header", temporary, runNode(reservation));
  renameSync(temporary, join(dir, HEADER));
}

// All publishers hold this run's exclusive lock. A kill can leave a temporary file, never a partial final receipt.
export async function publishRun(changeDir: string, run: RunRecord): Promise<void> {
  const base = `run-${String(run.n)}`;
  const receipt = join(changeDir, "records", base + ".xml");
  if (existsSync(receipt)) throw new Error(`receipt already exists: ${base}`);
  const temporary = join(changeDir, "records", "logs", base, `receipt-${randomUUID()}.tmp`);
  await writeRecord("run", temporary, runNode(run));
  renameSync(temporary, receipt);
}

function recoveredResult(changeDir: string, base: string, result: RunResult, index: number, paths: { saved: string; output: string }): RunResult {
  const names = result.kind === "trace" && result.definition.includes("\nlog=") ? [paths.saved, paths.output] : [paths.saved];
  for (const log of names) {
    const path = join(changeDir, log);
    const entry = lstatSync(path, { throwIfNoEntry: false });
    if (!entry) continue;
    if (!entry.isFile()) throw new Error(`invalid log: ${log}`);
    // A child may outlive its runner and still own the original output descriptor.
    const bytes = readFileSync(path);
    const digest = sha256Hex(bytes);
    const folder = `records/logs/${base}/recovered`;
    mkdirSync(join(changeDir, folder), { recursive: true });
    const snapshot = `${folder}/${String(index + 1)}-${digest}.log`;
    const temporary = join(changeDir, folder, randomUUID() + ".tmp");
    writeFileSync(temporary, bytes, { flag: "wx" });
    renameSync(temporary, join(changeDir, snapshot));
    return { ...result, verdict: "interrupted", reason: `recovered from ${log}`, log: snapshot, logSha256: digest };
  }
  return { ...result, verdict: "not-attempted", reason: "no log in recovered run" };
}

async function recoverOne(state: ChangeState, n: number): Promise<void> {
  const base = `run-${String(n)}`;
  const dir = join(state.dir, "records", "logs", base);
  const receipt = join(state.dir, "records", base + ".xml");
  if (existsSync(receipt)) return;
  if (!lstatSync(dir).isDirectory()) throw new Error("invalid log directory");
  const header = join(dir, HEADER);
  if (!lstatSync(dir + ".owner.sqlite", { throwIfNoEntry: false })?.isFile()) {
    throw new Error(existsSync(header) ? "missing or invalid ownership file" : "missing run-header.xml");
  }
  const lock = acquireRunLock(dir, false);
  if (!lock) {
    console.log(`live: ${base}`);
    return;
  }
  try {
    if (existsSync(receipt)) return;
    if (!lstatSync(header, { throwIfNoEntry: false })?.isFile()) throw new Error("missing or invalid run-header.xml");
    const contents = readFileSync(header, "utf8");
    const errors = await validateOne("run-header", HEADER, contents);
    if (errors.length) throw new Error(`invalid header: ${errors[0]}`);
    const run = readReservation(parseXml(contents));
    if (run.change !== state.id || run.n !== n) throw new Error("header names a different reservation");
    const ids = new Set<string>();
    for (const result of run.results) {
      const identity = `kind=${result.kind}\nid=${result.check}\nrequired=${String(result.required)}\n`;
      if (ids.has(result.check) || !result.definition.startsWith(identity) || sha256Hex(result.definition) !== result.definitionSha256) {
        throw new Error(`invalid header definition for ${result.check}`);
      }
      ids.add(result.check);
    }
    const layout = runLogs(n, run.results.map(result => result.check));
    await publishRun(state.dir, {
      ...run, status: "interrupted", ended: new Date().toISOString(),
      results: run.results.map((result, i) => recoveredResult(state.dir, base, result, i, layout[i]!)),
    });
    console.log(`receipt: ${state.path}/records/${base}.xml`);
  } finally {
    lock.close();
  }
}

export async function recoverRuns(state: ChangeState): Promise<number> {
  let exit = 0;
  for (const n of state.records.logDirs) {
    try {
      await recoverOne(state, n);
    } catch (error) {
      console.error(`refused: run-${String(n)}: ${error instanceof Error ? error.message : String(error)}; keep its logs. Use grace5 status ${state.id}, then grace5 run ${state.id} for fresh evidence (add --start if there is no start receipt).`);
      exit = 1;
    }
  }
  return exit;
}
