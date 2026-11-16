// grace5 run (commands.md, evidence-records.md, trace-provenance.md): executes checks and writes one receipt per invocation.

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { environmentIdentity, sha256Hex, type Check } from "../contract";
import { revisionsWithCandidate } from "../git";
import { kernelName, runNode, writeRecord, type RunRecord, type RunResult, type TraceRecord, type Verdict } from "../records";
import { evaluate, mayRun, selectChange, type ChangeState } from "../state";
import { buildSatisfies, judgeProvenance, matchMarkers, readProvenance } from "../trace";

export interface RunOptions {
  readonly root: string;
  readonly change: string | undefined;
  readonly start: boolean;
  readonly checks: readonly string[];
  readonly skip: readonly string[];
  readonly observe: string | undefined;
  readonly build: string | undefined;
  readonly environment: string | undefined;
  readonly reference: string | undefined;
  readonly note: string | undefined;
  readonly from: string | undefined;
}

const OBSERVED: readonly Verdict[] = ["passed", "failed", "blocked", "not-attempted"];

class Usage extends Error {}

// A signal marks the run interrupted and stops the running command; the receipt is still written (evidence-records.md).
let interrupted = false;
let stopRunning: (() => void) | undefined;

function killTree(pid: number): void {
  if (process.platform === "win32") spawnSync("taskkill", ["/T", "/F", "/pid", String(pid)], { windowsHide: true, stdio: "ignore" });
  else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
  }
}

interface Execution {
  readonly exit: number | undefined;
  readonly elapsedMs: number;
  readonly started: string;
  readonly ended: string;
  readonly cancelled: boolean;
  readonly error: string | undefined;
}

/** Runs the command through the platform shell with output and error captured together; the budget kills the process tree. */
function execute(command: string, cwd: string, budgetSeconds: number, env: NodeJS.ProcessEnv, logPath: string): Promise<Execution> {
  return new Promise((resolve) => {
    const fd = openSync(logPath, "w");
    const started = new Date();
    const windows = process.platform === "win32";
    let cancelled = false;
    let settled = false;
    const child = windows
      ? spawn(process.env["ComSpec"] ?? "cmd.exe", ["/d", "/s", "/c", `"${command}"`], { cwd, env, stdio: ["ignore", fd, fd], windowsVerbatimArguments: true, windowsHide: true })
      : spawn("sh", ["-c", command], { cwd, env, stdio: ["ignore", fd, fd], detached: true });
    const stop = (): void => {
      if (child.pid !== undefined) killTree(child.pid);
    };
    const timer = setTimeout(() => {
      cancelled = true;
      stop();
    }, budgetSeconds * 1000);
    stopRunning = stop;
    const finish = (exit: number | undefined, error: string | undefined): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stopRunning = undefined;
      closeSync(fd);
      const ended = new Date();
      resolve({ exit, elapsedMs: ended.getTime() - started.getTime(), started: started.toISOString(), ended: ended.toISOString(), cancelled, error });
    };
    child.on("error", (error) => finish(undefined, error.message));
    child.on("close", (code) => finish(code ?? undefined, undefined));
  });
}

function blank(check: Check, verdict: Verdict, reason: string | undefined): RunResult {
  return {
    check: check.id,
    kind: check.kind,
    required: check.required,
    definitionSha256: check.definitionSha256,
    definition: check.definition,
    verdict,
    claim: undefined,
    cwd: check.cwd,
    exit: undefined,
    elapsedMs: undefined,
    log: undefined,
    logSha256: undefined,
    environment: check.environment === undefined ? undefined : environmentIdentity(check.environment),
    trace: undefined,
    observation: undefined,
    reason,
  };
}

interface RunContext {
  readonly state: ChangeState;
  readonly root: string;
  readonly n: number;
  readonly runId: string;
  readonly revision: string;
  readonly candidate: string;
  readonly sameCandidateRevisions: () => Iterable<string>;
}

async function runCheck(check: Check, context: RunContext): Promise<RunResult> {
  const base = blank(check, "failed", undefined);
  const cwd = join(context.root, check.cwd ?? ".");
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) return { ...base, reason: `cwd ${check.cwd ?? "."} is not a directory` };
  const logName = `records/logs/run-${String(context.n)}/${check.id}.log`;
  const logPath = join(context.state.dir, logName);
  // A trace check that names its own log file keeps the command's output beside it.
  const outputPath = check.log === undefined ? logPath : join(context.state.dir, `records/logs/run-${String(context.n)}/${check.id}.output.log`);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GRACE5_RUN_ID: context.runId,
    GRACE5_CHANGE: context.state.id,
    GRACE5_CHECK: check.id,
    GRACE5_SOURCE_REVISION: context.revision,
    GRACE5_CANDIDATE: context.candidate,
  };
  const run = await execute(check.command ?? "", cwd, check.budget ?? 1, env, outputPath);

  let logMissing = false;
  if (check.log !== undefined) {
    const produced = join(cwd, check.log);
    if (existsSync(produced) && statSync(produced).isFile()) copyFileSync(produced, logPath);
    else logMissing = true;
  }
  const bytes = logMissing ? undefined : readFileSync(logPath);
  const executed: RunResult = {
    ...base,
    exit: run.cancelled || interrupted ? undefined : run.exit,
    elapsedMs: run.elapsedMs,
    log: logMissing ? undefined : logName,
    logSha256: bytes === undefined ? undefined : sha256Hex(bytes),
  };
  const stopped: { verdict: Verdict; reason: string } | undefined = interrupted
    ? { verdict: "interrupted", reason: "the run was interrupted" }
    : run.cancelled
      ? { verdict: "cancelled", reason: `budget of ${String(check.budget ?? 0)} seconds exceeded` }
      : run.error !== undefined
        ? { verdict: "failed", reason: `the command could not be started: ${run.error}` }
        : run.exit !== 0
          ? { verdict: "failed", reason: run.exit === undefined ? "the command was terminated" : `exit ${String(run.exit)}` }
          : undefined;

  if (check.kind === "automated") {
    return stopped === undefined ? { ...executed, verdict: "passed", claim: "command-completion" } : { ...executed, ...stopped };
  }

  const log = bytes === undefined ? "" : bytes.toString("utf8");
  const provenance = readProvenance(log, context.runId);
  const judged = judgeProvenance(check, provenance, context.sameCandidateRevisions);
  const consult = stopped === undefined && !logMissing && judged.refusal === undefined;
  const sequence = consult ? matchMarkers(log, check.expects, check.forbids) : undefined;
  const trace: TraceRecord = {
    origin: provenance.origin,
    originSource: provenance.origin === undefined ? "absent" : "observed",
    runEcho: provenance.echoed,
    captureStarted: run.started,
    captureEnded: run.ended,
    device: judged.device,
    deviceSource: judged.deviceSource,
    build: judged.build,
    buildSource: judged.buildSource,
    matched: sequence?.matched ?? 0,
    expected: check.expects.length,
    missing: sequence?.missing === undefined ? [] : [sequence.missing],
    forbidden: sequence?.forbidden ?? [],
  };
  if (stopped !== undefined) return { ...executed, ...stopped, trace };
  if (logMissing) return { ...executed, verdict: "failed", reason: `log file ${check.log ?? ""} was not written`, trace };
  if (judged.refusal !== undefined) return { ...executed, verdict: "refused", reason: judged.refusal, trace };
  if (sequence?.reason !== undefined) return { ...executed, verdict: "failed", reason: sequence.reason, trace };
  return { ...executed, verdict: "passed", claim: judged.claim, trace };
}

function readObservationFile(path: string): Map<string, string> {
  const fields = new Map<string, string>();
  if (!existsSync(path)) throw new Usage(`--from: ${path} does not exist`);
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const equals = line.indexOf("=");
    const name = equals < 0 ? "" : line.slice(0, equals).trim();
    if (!["observe", "build", "environment", "reference", "note"].includes(name)) throw new Usage(`--from: unknown field '${name}'; expected observe, build, environment, reference, note as name=value`);
    fields.set(name, line.slice(equals + 1).trim());
  }
  return fields;
}

function nextRunNumber(state: ChangeState): number {
  const dir = join(state.dir, "records");
  let highest = 0;
  for (const base of [dir, join(dir, "logs")]) {
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const match = /^run-([1-9][0-9]*)(\.xml)?$/.exec(name);
      if (match !== null) highest = Math.max(highest, Number(match[1]));
    }
  }
  return highest + 1;
}

function refuse(reason: string): number {
  console.error(`refused: ${reason}`);
  return 1;
}

export async function runCommand(options: RunOptions): Promise<number> {
  try {
    return await runInner(options);
  } catch (error) {
    if (error instanceof Usage) {
      console.error(`usage: ${error.message}`);
      return 2;
    }
    throw error;
  }
}

async function runInner(options: RunOptions): Promise<number> {
  const file = options.from === undefined ? new Map<string, string>() : readObservationFile(options.from);
  const observe = options.observe ?? file.get("observe");
  const skipping = options.skip.length > 0;
  const observing = observe !== undefined;
  if (options.from !== undefined && !observing) throw new Usage("--from needs an observe field or --observe");
  if (skipping && (options.start || observing || options.checks.length > 0)) throw new Usage("--skip stands alone with --note");
  if (skipping && (options.note ?? "").trim() === "") throw new Usage("--skip needs --note <reason>");
  if (observing && options.start) throw new Usage("--observe cannot be combined with --start");
  if (observing && options.checks.length !== 1) throw new Usage("--observe needs exactly one --check <id>");
  if (observing && !OBSERVED.includes(observe as Verdict)) throw new Usage(`--observe takes one of ${OBSERVED.join(", ")}`);
  const build = options.build ?? file.get("build");
  const note = options.note ?? file.get("note");
  const reference = options.reference ?? file.get("reference");
  const statedEnvironment = options.environment ?? file.get("environment");
  if (observing) {
    for (const [name, value] of [["--build", build], ["--note", note]] as const) {
      if ((value ?? "").trim() === "") throw new Usage(`--observe needs ${name}`);
    }
  } else if (!skipping && [options.build, options.environment, options.reference, options.note].some((value) => value !== undefined)) {
    throw new Usage("--build, --environment, --reference and --note belong to --observe (and --note to --skip)");
  }

  const selection = selectChange(options.root, options.change);
  if ("error" in selection) {
    if (selection.usage) throw new Usage(selection.error);
    return refuse(selection.error);
  }
  const state = await evaluate(options.root, selection.id);
  const contract = state.contract;
  if (state.closed) return refuse("change is closed");
  if (state.malformed !== undefined || contract === undefined || state.report === undefined) return refuse(`change is malformed: ${state.malformed ?? ""}`);
  // commands.md, Details settled in implementation: a defect of the contract or of a record holds a run at any time,
  // a defect of the current revision's brief only once that revision is approved, so a draft brief never stops the bound checks.
  const approved = state.authorization === "approved";
  const holding = state.blocking.find((defect) => approved || !state.briefDefects.includes(defect));
  if (holding !== undefined) return refuse(`change has defects: ${holding}`);
  const source = state.source;
  if (source === undefined) return refuse("not a git repository");
  if (source.revision === undefined || source.candidate === undefined) return refuse("no source revision");
  if (state.executionApproval === undefined) {
    if (state.authorization === "altered after approval") return refuse("contract altered after approval");
    return refuse(`no approval for revision ${String(contract.revision)}`);
  }
  if (options.start && state.startRun !== undefined) return refuse(`a start run exists: run-${String(state.startRun.n)}`);
  if (!options.start && state.startRun === undefined) return refuse("no start run");

  const named = skipping ? options.skip : options.checks;
  for (const id of named) if (!contract.checks.some((check) => check.id === id)) return refuse(`no check ${id} in the contract`);
  let selected: readonly Check[];
  if (skipping) selected = contract.checks.filter((check) => named.includes(check.id));
  else if (observing) {
    selected = contract.checks.filter((check) => check.id === named[0]);
    if (selected[0]?.kind !== "manual") return refuse(`check ${named[0] ?? ""} is not a manual check`);
  } else {
    const manual = contract.checks.find((check) => named.includes(check.id) && check.kind === "manual");
    if (manual !== undefined) return refuse(`check ${manual.id} is manual; record it with --observe`);
    if (options.start) selected = contract.checks.filter((check) => check.kind === "automated" || (check.kind === "trace" && named.includes(check.id)));
    else if (named.length > 0) selected = contract.checks.filter((check) => named.includes(check.id));
    else selected = contract.checks.filter((check) => check.kind !== "manual");
  }
  const declared = selected[0]?.environment;
  const environment = statedEnvironment ?? declared?.text;
  if (observing && (environment ?? "").trim() === "") throw new Usage(`--environment is needed: check ${named[0] ?? ""} declares no Environment`);

  // The log directory is reserved first; it is also what marks a run that died without a receipt.
  let n = nextRunNumber(state);
  mkdirSync(join(state.dir, "records", "logs"), { recursive: true });
  for (;;) {
    try {
      mkdirSync(join(state.dir, "records", "logs", `run-${String(n)}`));
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      n++;
    }
  }

  const revision = source.revision;
  const candidate = source.candidate;
  let sameCandidate: readonly string[] | undefined;
  const context: RunContext = {
    state,
    root: options.root,
    n,
    runId: randomUUID().replace(/-/g, ""),
    revision,
    candidate,
    // The run's own revision first; its ancestors are walked only when that one does not satisfy the build.
    sameCandidateRevisions: function* () {
      yield revision;
      yield* (sameCandidate ??= revisionsWithCandidate(source.git, revision, candidate));
    },
  };
  const onSignal = (): void => {
    interrupted = true;
    stopRunning?.();
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, onSignal);

  const started = new Date().toISOString();
  const results: RunResult[] = [];
  for (const check of selected) {
    if (skipping) results.push(blank(check, "skipped", note));
    else if (interrupted) results.push(blank(check, "not-attempted", undefined));
    else if (!mayRun(state, check)) results.push(blank(check, "refused", "amended in unapproved revision"));
    else if (observing) {
      const satisfied = declared?.build === undefined || buildSatisfies(declared.build, build ?? "", context.sameCandidateRevisions);
      const verdict: Verdict = satisfied ? (observe as Verdict) : "refused";
      results.push({
        ...blank(check, verdict, satisfied ? undefined : "build mismatch"),
        claim: verdict === "passed" ? "observation" : undefined,
        observation: { at: new Date().toISOString(), build: build ?? "", environment: environment ?? "", reference: reference === undefined || reference.trim() === "" ? undefined : reference, note: note ?? "" },
      });
    } else results.push(await runCheck(check, context));
  }
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.off(signal, onSignal);

  const record: RunRecord = {
    change: state.id,
    revision: contract.revision,
    contractSha256: state.report.sha256,
    n,
    runId: context.runId,
    started,
    ended: new Date().toISOString(),
    status: interrupted ? "interrupted" : "completed",
    start: options.start,
    sourceRevision: revision,
    dirty: source.dirty.length > 0,
    candidate,
    kernel: kernelName(),
    preexisting: options.start ? source.dirty : [],
    results,
  };
  await writeRecord("run", join(state.dir, "records", `run-${String(n)}.xml`), runNode(record));
  for (const result of results) console.log(`run ${String(n)}: ${result.check} ${result.verdict}${result.reason === undefined ? "" : `: ${result.reason}`}`);
  console.log(`receipt: ${state.path}/records/run-${String(n)}.xml`);
  if (interrupted) return 1;
  if (skipping) return 0;
  // An observation the operator reported as not passed is recorded as asked; only a refusal fails the invocation.
  if (observing) return results.some((result) => result.verdict === "refused") ? 1 : 0;
  return results.every((result) => result.verdict === "passed") ? 0 : 1;
}
