// The records of one change: reading what is there (validated against the schemas first) and writing run receipts and close.xml.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { readBrief, type Brief } from "./brief";
import { sha256Hex, xsBoolean, type CheckKind } from "./contract";
import { validateMany, validateOne, type SchemaName } from "./schema";
import type { IdentitySource, Origin } from "./trace";
import { childNamed, childrenNamed, collapse, parseXml, writeXml, type XmlElement, type XmlNode } from "./xml";

export type Verdict = "passed" | "failed" | "blocked" | "not-attempted" | "skipped" | "cancelled" | "interrupted" | "refused";
export type Claim = "command-completion" | "marker-sequence-live" | "marker-sequence-replay" | "marker-sequence-fixture" | "marker-sequence-unattributed" | "observation";

export interface Binding {
  readonly change: string;
  readonly revision: number;
  readonly contractSha256: string;
}

export interface Approval extends Binding {
  readonly file: string;
  /** Legacy: the hash of the brief page the owner read. Undefined for a new approval, which binds no page (authorization.md). */
  readonly briefSha256: string | undefined;
  readonly decision: "approved" | "rejected";
  /** `approved` or empty for an approval, the reason for a rejection. */
  readonly statement: string;
  readonly bound: readonly { readonly check: string; readonly definitionSha256: string }[];
}

export interface TraceRecord {
  readonly origin: Origin | undefined;
  readonly originSource: IdentitySource;
  readonly runEcho: boolean;
  readonly captureStarted: string;
  readonly captureEnded: string;
  readonly device: string | undefined;
  readonly deviceSource: IdentitySource;
  readonly build: string | undefined;
  readonly buildSource: IdentitySource;
  readonly matched: number;
  readonly expected: number;
  readonly missing: readonly string[];
  readonly forbidden: readonly string[];
}

export interface ObservationRecord {
  readonly at: string;
  readonly build: string;
  readonly environment: string;
  readonly reference: string | undefined;
  readonly note: string;
}

export interface RunResult {
  readonly check: string;
  readonly kind: CheckKind;
  readonly required: boolean;
  readonly definitionSha256: string;
  readonly definition: string;
  readonly verdict: Verdict;
  readonly claim: Claim | undefined;
  readonly cwd: string | undefined;
  readonly exit: number | undefined;
  readonly elapsedMs: number | undefined;
  readonly log: string | undefined;
  readonly logSha256: string | undefined;
  readonly environment: string | undefined;
  readonly trace: TraceRecord | undefined;
  readonly observation: ObservationRecord | undefined;
  readonly reason: string | undefined;
}

export interface RunRecord extends Binding {
  readonly n: number;
  readonly runId: string;
  readonly started: string;
  readonly ended: string;
  readonly status: "completed" | "interrupted";
  readonly start: boolean;
  readonly sourceRevision: string;
  readonly dirty: boolean;
  readonly candidate: string;
  readonly kernel: string;
  readonly preexisting: readonly string[];
  readonly results: readonly RunResult[];
}

export type RunReservation = Omit<RunRecord, "ended" | "status">;

export interface Review extends Binding {
  readonly n: number;
  readonly status: "completed" | "incomplete";
  readonly independence: string;
  readonly startRevision: string;
  readonly endRevision: string;
  readonly candidate: string;
  readonly findings: readonly { readonly id: string; readonly severity: string; readonly status: string; readonly ownerDecision: string | undefined }[];
  readonly adequacy: readonly { readonly check: string; readonly discriminates: boolean }[];
  readonly rules: readonly { readonly rule: string; readonly verdict: string }[];
}

export interface CloseRecord extends Binding {
  readonly date: string;
  readonly sourceRevision: string;
  readonly candidate: string;
  readonly startRevision: string;
  /** Legacy: the brief page of the change. Undefined for a new approval, whose close names no brief (evidence-records.md). */
  readonly brief: string | undefined;
  readonly approval: string;
  readonly review: number;
  readonly kernel: string;
  readonly satisfied: readonly { readonly check: string; readonly kind: CheckKind; readonly run: number; readonly claim: string }[];
  readonly notRequired: readonly { readonly check: string; readonly verdict: string | undefined }[];
}

export interface BriefFile {
  readonly file: string;
  readonly revision: number;
  /** SHA-256 of the bytes of the page (authorization.md). */
  readonly sha256: string;
  readonly brief: Brief;
}

export interface ChangeRecords {
  readonly approvals: ReadonlyMap<number, Approval>;
  readonly briefs: ReadonlyMap<number, BriefFile>;
  /** Ascending by n. */
  readonly runs: readonly RunRecord[];
  readonly reviews: readonly Review[];
  readonly close: CloseRecord | undefined;
  /** close.xml is present, valid or not. */
  readonly closeExists: boolean;
  /** Numbers of the log directories under records/logs. */
  readonly logDirs: readonly number[];
  /** Records that fail their schema, name another change or carry a number other than their file name's. */
  readonly defects: readonly string[];
}

let kernel: string | undefined;

/** `grace5 <version from package.json>`, the `kernel` attribute of written records. */
export function kernelName(): string {
  if (kernel === undefined) {
    const manifest = JSON.parse(readFileSync(resolve(import.meta.dir, "..", "package.json"), "utf8")) as { version?: unknown };
    kernel = `grace5 ${typeof manifest.version === "string" ? manifest.version : "unknown"}`;
  }
  return kernel;
}

/** The version alone, as package.json states it; the pin of upgrade.md is compared with this. */
export function kernelVersion(): string {
  return kernelName().slice("grace5 ".length);
}

const attr = (element: XmlElement, name: string): string => collapse(element.attributes[name] ?? "");
const optionalAttr = (element: XmlElement, name: string): string | undefined => (element.attributes[name] === undefined ? undefined : attr(element, name));
const numberAttr = (element: XmlElement, name: string): number | undefined => (element.attributes[name] === undefined ? undefined : Number(attr(element, name)));

function binding(root: XmlElement): Binding {
  return { change: attr(root, "change"), revision: Number(attr(root, "revision")), contractSha256: attr(root, "contract-sha256") };
}

function readApproval(root: XmlElement, file: string): Approval {
  return {
    ...binding(root),
    file,
    briefSha256: optionalAttr(root, "brief-sha256"),
    decision: attr(root, "decision") === "approved" ? "approved" : "rejected",
    statement: collapse(childNamed(root, "Statement")?.text ?? ""),
    bound: childrenNamed(root, "Bound").map((b) => ({ check: attr(b, "check"), definitionSha256: attr(b, "definition-sha256") })),
  };
}

function readResult(element: XmlElement): RunResult {
  const trace = childNamed(element, "Trace");
  const observation = childNamed(element, "Observation");
  const reason = childNamed(element, "Reason");
  return {
    check: attr(element, "check"),
    kind: attr(element, "kind") as CheckKind,
    required: xsBoolean(element.attributes["required"], true),
    definitionSha256: attr(element, "definition-sha256"),
    definition: childNamed(element, "Definition")?.text ?? "",
    verdict: (element.attributes["verdict"] ?? "not-attempted") as Verdict,
    claim: optionalAttr(element, "claim") as Claim | undefined,
    cwd: optionalAttr(element, "cwd"),
    exit: numberAttr(element, "exit"),
    elapsedMs: numberAttr(element, "elapsed-ms"),
    log: optionalAttr(element, "log"),
    logSha256: optionalAttr(element, "log-sha256"),
    environment: optionalAttr(element, "environment"),
    trace: trace === undefined ? undefined : {
      origin: optionalAttr(trace, "origin") as Origin | undefined,
      originSource: attr(trace, "origin-source") as IdentitySource,
      runEcho: xsBoolean(trace.attributes["run-echo"], false),
      captureStarted: attr(trace, "capture-started"),
      captureEnded: attr(trace, "capture-ended"),
      device: optionalAttr(trace, "device"),
      deviceSource: attr(trace, "device-source") as IdentitySource,
      build: optionalAttr(trace, "build"),
      buildSource: attr(trace, "build-source") as IdentitySource,
      matched: Number(attr(trace, "matched")),
      expected: Number(attr(trace, "expected")),
      missing: childrenNamed(trace, "Missing").map((m) => collapse(m.text)),
      forbidden: childrenNamed(trace, "Forbidden").map((m) => collapse(m.text)),
    },
    observation: observation === undefined ? undefined : {
      at: attr(observation, "at"),
      build: attr(observation, "build"),
      environment: attr(observation, "environment"),
      reference: optionalAttr(observation, "reference"),
      note: collapse(observation.text),
    },
    reason: reason === undefined ? undefined : collapse(reason.text),
  };
}

export function readReservation(root: XmlElement): RunReservation {
  return {
    ...binding(root),
    n: Number(attr(root, "n")),
    runId: attr(root, "run-id"),
    started: attr(root, "started"),
    start: xsBoolean(root.attributes["start"], false),
    sourceRevision: attr(root, "source-revision"),
    dirty: xsBoolean(root.attributes["dirty"], true),
    candidate: attr(root, "candidate"),
    kernel: attr(root, "kernel"),
    preexisting: childrenNamed(root, "Preexisting").map((p) => p.text),
    results: childrenNamed(root, "Result").map(readResult),
  };
}

function readRun(root: XmlElement): RunRecord {
  return {
    ...readReservation(root),
    ended: attr(root, "ended"),
    status: attr(root, "status") === "completed" ? "completed" : "interrupted",
  };
}

function readReview(root: XmlElement): Review {
  return {
    ...binding(root),
    n: Number(attr(root, "n")),
    status: attr(root, "status") === "completed" ? "completed" : "incomplete",
    independence: attr(root, "independence"),
    startRevision: attr(root, "start-revision"),
    endRevision: attr(root, "end-revision"),
    candidate: attr(root, "candidate"),
    findings: childrenNamed(root, "Finding").map((f) => {
      const decision = childNamed(f, "OwnerDecision");
      return { id: attr(f, "id"), severity: attr(f, "severity"), status: attr(f, "status"), ownerDecision: decision === undefined ? undefined : collapse(decision.text) };
    }),
    adequacy: childrenNamed(root, "Adequacy").map((a) => ({ check: attr(a, "check"), discriminates: xsBoolean(a.attributes["discriminates"], false) })),
    rules: childrenNamed(root, "Rule").map((r) => ({ rule: attr(r, "rule"), verdict: attr(r, "verdict") })),
  };
}

function readClose(root: XmlElement): CloseRecord {
  return {
    ...binding(root),
    date: attr(root, "date"),
    sourceRevision: attr(root, "source-revision"),
    candidate: attr(root, "candidate"),
    startRevision: attr(root, "start-revision"),
    brief: optionalAttr(root, "brief"),
    approval: attr(root, "approval"),
    review: Number(attr(root, "review")),
    kernel: attr(root, "kernel"),
    satisfied: childrenNamed(root, "Satisfied").map((s) => ({ check: attr(s, "check"), kind: attr(s, "kind") as CheckKind, run: Number(attr(s, "run")), claim: attr(s, "claim") })),
    notRequired: childrenNamed(root, "NotRequired").map((s) => ({ check: attr(s, "check"), verdict: optionalAttr(s, "verdict") })),
  };
}

interface Pending {
  readonly file: string;
  readonly schema: SchemaName;
  readonly number: number | undefined;
  readonly contents: string;
}

/** Reads `records/` of a change directory. A record that fails validation is reported and left out of the model. */
export async function loadRecords(changeDir: string, changeId: string): Promise<ChangeRecords> {
  const dir = join(changeDir, "records");
  const defects: string[] = [];
  const pending: Pending[] = [];
  const briefs = new Map<number, BriefFile>();
  const names = existsSync(dir) ? readdirSync(dir).sort((a, b) => a.localeCompare(b, "en", { numeric: true })) : [];
  for (const file of names) {
    const path = join(dir, file);
    if (!statSync(path).isFile()) continue;
    const brief = /^brief-([1-9][0-9]*)\.html$/.exec(file);
    if (brief !== null) {
      const bytes = readFileSync(path);
      briefs.set(Number(brief[1]), { file, revision: Number(brief[1]), sha256: sha256Hex(bytes), brief: readBrief(bytes.toString("utf8")) });
      continue;
    }
    if (!file.endsWith(".xml")) continue;
    const numbered = /^(approval|run|review)-([1-9][0-9]*)\.xml$/.exec(file);
    if (numbered !== null) pending.push({ file, schema: numbered[1] as SchemaName, number: Number(numbered[2]), contents: readFileSync(path, "utf8") });
    else if (file === "close.xml") pending.push({ file, schema: "close", number: undefined, contents: readFileSync(path, "utf8") });
    else defects.push(`${file}: not a record name the method defines`);
  }

  const schemas = [...new Set(pending.map((p) => p.schema))];
  const validated = await Promise.all(schemas.map((schema) => validateMany(schema, pending.filter((p) => p.schema === schema).map((p) => ({ fileName: p.file, contents: p.contents })))));
  const errorsOf = (p: Pending): readonly string[] => validated[schemas.indexOf(p.schema)]?.get(p.file) ?? [];

  const approvals = new Map<number, Approval>();
  const runs: RunRecord[] = [];
  const reviews: Review[] = [];
  let close: CloseRecord | undefined;
  for (const p of pending) {
    const errors = errorsOf(p);
    if (errors.length > 0) {
      for (const error of errors) defects.push(`${p.file}: ${error}`);
      continue;
    }
    let root: XmlElement;
    try {
      root = parseXml(p.contents);
    } catch (error) {
      defects.push(`${p.file}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const named = attr(root, "change");
    if (named !== changeId) {
      defects.push(`${p.file}: names change ${named}, not ${changeId}`);
      continue;
    }
    const own = p.schema === "approval" ? attr(root, "revision") : p.schema === "close" ? undefined : attr(root, "n");
    if (own !== undefined && Number(own) !== p.number) {
      defects.push(`${p.file}: carries number ${own}, its name says ${String(p.number)}`);
      continue;
    }
    if (p.schema === "approval") approvals.set(p.number ?? 0, readApproval(root, p.file));
    else if (p.schema === "run") runs.push(readRun(root));
    else if (p.schema === "review") reviews.push(readReview(root));
    else close = readClose(root);
  }
  runs.sort((a, b) => a.n - b.n);
  reviews.sort((a, b) => a.n - b.n);

  const logs = join(dir, "logs");
  const logDirs = existsSync(logs)
    ? readdirSync(logs).map((name) => /^run-([1-9][0-9]*)$/.exec(name)).filter((m) => m !== null).map((m) => Number(m[1])).sort((a, b) => a - b)
    : [];
  return { approvals, briefs, runs, reviews, close, closeExists: pending.some((p) => p.schema === "close"), logDirs, defects };
}

function resultNode(result: RunResult, receipt: boolean): XmlNode {
  const children: XmlNode[] = [{ name: "Definition", text: result.definition }];
  const trace = result.trace;
  if (trace !== undefined) {
    children.push({
      name: "Trace",
      attributes: {
        origin: trace.origin,
        "origin-source": trace.originSource,
        "run-echo": trace.runEcho,
        "capture-started": trace.captureStarted,
        "capture-ended": trace.captureEnded,
        device: trace.device,
        "device-source": trace.deviceSource,
        build: trace.build,
        "build-source": trace.buildSource,
        matched: trace.matched,
        expected: trace.expected,
      },
      children: [...trace.missing.map((text) => ({ name: "Missing", text })), ...trace.forbidden.map((text) => ({ name: "Forbidden", text }))],
    });
  }
  const observation = result.observation;
  if (observation !== undefined) {
    children.push({
      name: "Observation",
      attributes: { at: observation.at, build: observation.build, environment: observation.environment, reference: observation.reference },
      text: observation.note,
    });
  }
  if (result.reason !== undefined && result.reason.trim() !== "") children.push({ name: "Reason", text: result.reason });
  return {
    name: "Result",
    attributes: {
      check: result.check,
      kind: result.kind,
      required: result.required,
      "definition-sha256": result.definitionSha256,
      verdict: receipt ? result.verdict : undefined,
      claim: result.claim,
      cwd: result.cwd,
      exit: result.exit,
      "elapsed-ms": result.elapsedMs,
      log: result.log,
      "log-sha256": result.logSha256,
      environment: result.environment,
    },
    children,
  };
}

export function runNode(run: RunRecord | RunReservation): XmlNode {
  const receipt = "ended" in run;
  return {
    name: receipt ? "Run" : "RunHeader",
    attributes: {
      change: run.change,
      revision: run.revision,
      "contract-sha256": run.contractSha256,
      n: run.n,
      "run-id": run.runId,
      started: run.started,
      ended: receipt ? run.ended : undefined,
      status: receipt ? run.status : undefined,
      start: run.start ? true : undefined,
      "source-revision": run.sourceRevision,
      dirty: run.dirty,
      candidate: run.candidate,
      kernel: run.kernel,
    },
    children: [...run.preexisting.map((text) => ({ name: "Preexisting", text })), ...run.results.map(result => resultNode(result, receipt))],
  };
}

export function closeNode(close: CloseRecord): XmlNode {
  return {
    name: "Close",
    attributes: {
      change: close.change,
      revision: close.revision,
      "contract-sha256": close.contractSha256,
      date: close.date,
      "source-revision": close.sourceRevision,
      candidate: close.candidate,
      "start-revision": close.startRevision,
      brief: close.brief,
      approval: close.approval,
      review: close.review,
      kernel: close.kernel,
    },
    children: [
      ...close.satisfied.map((s) => ({ name: "Satisfied", attributes: { check: s.check, kind: s.kind, run: s.run, claim: s.claim } })),
      ...close.notRequired.map((s) => ({ name: "NotRequired", attributes: { check: s.check, verdict: s.verdict } })),
    ],
  };
}

/** Validates the record against its schema and writes it. Refuses to write an invalid record or to replace an existing one. */
export async function writeRecord(schema: SchemaName, path: string, node: XmlNode): Promise<void> {
  const text = writeXml(node);
  const errors = await validateOne(schema, "record.xml", text);
  if (errors.length > 0) throw new Error(`the ${schema} record would not validate against its schema: ${errors[0] ?? ""}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, { flag: "wx" });
}
