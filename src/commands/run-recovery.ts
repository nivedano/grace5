import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { sha256Hex } from "../contract";
import { readReservation, runNode, writeRecord, type RunRecord, type RunReservation, type RunResult } from "../records";
import { validateOne } from "../schema";
import type { ChangeState } from "../state";
import { parseXml } from "../xml";

const HEADER = "run-header.xml";
const LOCK = "owner.sqlite";

// SQLite holds the OS lock until close or process death. Keep the file so every contender locks the same inode.
export function acquireRunLock(dir: string, create: boolean): Database | undefined {
  const db = new Database(join(dir, LOCK), { readwrite: true, create });
  try {
    db.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE");
    return db;
  } catch (error) {
    db.close();
    if ((error as { code?: string }).code === "SQLITE_BUSY") return undefined;
    throw error;
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

function recoveredResult(changeDir: string, base: string, result: RunResult): RunResult {
  const prefix = `records/logs/${base}/${result.check}`;
  const names = [prefix + ".log"];
  if (result.kind === "trace" && result.definition.includes("\nlog=")) names.push(prefix + ".output.log");
  for (const log of names) {
    const path = join(changeDir, log);
    const entry = lstatSync(path, { throwIfNoEntry: false });
    if (!entry) continue;
    if (!entry.isFile()) throw new Error(`invalid log: ${log}`);
    return { ...result, verdict: "interrupted", reason: "recovered from an abandoned run", log, logSha256: sha256Hex(readFileSync(path)) };
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
  // The writer publishes the header under ownership. Never compete for its lock during initial reservation.
  if (!lstatSync(header, { throwIfNoEntry: false })?.isFile()) throw new Error("missing or invalid run-header.xml");
  if (!lstatSync(join(dir, LOCK), { throwIfNoEntry: false })?.isFile()) throw new Error("missing or invalid ownership file");
  const lock = acquireRunLock(dir, false);
  if (!lock) {
    console.log(`live: ${base}`);
    return;
  }
  try {
    if (existsSync(receipt)) return;
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
    await publishRun(state.dir, {
      ...run, status: "interrupted", ended: new Date().toISOString(),
      results: run.results.map(result => recoveredResult(state.dir, base, result)),
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
      const rerun = `grace5 run ${state.id}${state.startRun ? "" : " --start"}`;
      console.error(`refused: run-${String(n)}: ${error instanceof Error ? error.message : String(error)}; keep its logs and run ${rerun} for fresh evidence`);
      exit = 1;
    }
  }
  return exit;
}
