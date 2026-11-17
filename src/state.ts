// The single evaluation of a change. `status`, `run` and `close` all read this, so they cannot disagree:
// the eight steps of close (evidence-records.md) are the obligations below, and status's `next:` is the first unmet one.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { briefDefects } from "./brief";
import { matchesAny, readContract, type Check, type Contract, type ContractReport } from "./contract";
import { candidateOf, changedBetween, CHANGES_DIR, dirtyPaths, headRevision, openGit, type Git } from "./git";
import { loadRecords, type Approval, type BriefFile, type ChangeRecords, type Review, type RunRecord, type RunResult } from "./records";

/** The directory under `.grace5/changes/` that `close` moves a change into (commands.md). */
export const CLOSED_DIR = "closed";
/** Why a directory under closed/ without its close record is malformed. */
export const CLOSE_RECORD_MISSING = `records/close.xml is missing: a change under ${CHANGES_DIR}${CLOSED_DIR}/ must carry it`;

export type Authorization = "unapproved" | "approved" | "rejected" | "altered after approval";

export interface SourceState {
  readonly git: Git;
  /** Undefined before the first commit. */
  readonly revision: string | undefined;
  readonly candidate: string | undefined;
  readonly dirty: readonly string[];
}

export interface CheckState {
  readonly check: Check;
  /** The result in the highest-numbered run that contains the check. */
  readonly current: { readonly run: RunRecord; readonly result: RunResult } | undefined;
  /** Whether the current result would satisfy close for a required check. */
  readonly counts: boolean;
  /** Why it does not count: a fixed phrase of commands.md without its `check <id>: ` prefix. */
  readonly reason: string | undefined;
}

export interface ChangeState {
  readonly id: string;
  /** Path of the change directory relative to the root, forward slashes. */
  readonly path: string;
  readonly dir: string;
  /** The change directory is under `.grace5/changes/closed/`. */
  readonly inClosedDir: boolean;
  readonly report: ContractReport | undefined;
  readonly contract: Contract | undefined;
  readonly records: ChangeRecords;
  /** The first error that makes the change malformed, or undefined. */
  readonly malformed: string | undefined;
  /** Every defect `check` reports. */
  readonly defects: readonly string[];
  /** The defects that hold run and close: all of them except a check that serves no criterion. */
  readonly blocking: readonly string[];
  /** The defects of the current revision's legacy brief, a part of `blocking`. They hold a run only once that revision is approved. Empty for a new approval, which has no brief. */
  readonly briefDefects: readonly string[];
  /** The start run names a revision this repository cannot resolve, so the complete diff cannot be computed. */
  readonly startUnresolved: boolean;
  readonly authorization: Authorization;
  /** The approval record of the current revision. */
  readonly approval: Approval | undefined;
  /** The approval whose Bound hashes decide which checks may run (authorization.md), or undefined when nothing may. */
  readonly executionApproval: Approval | undefined;
  readonly brief: BriefFile | undefined;
  readonly startRun: RunRecord | undefined;
  readonly source: SourceState | undefined;
  /** Changed source files from the start revision, uncommitted work included. */
  readonly outside: readonly string[];
  readonly protectedTouched: readonly string[];
  readonly checks: readonly CheckState[];
  readonly review: Review | undefined;
  readonly interrupted: readonly number[];
  readonly closed: boolean;
  /** The first step close would refuse at, or undefined when every step is met. */
  readonly obligation: string | undefined;
}

export function changesDir(root: string): string {
  return join(root, ".grace5", "changes");
}

export function closedDir(root: string): string {
  return join(changesDir(root), CLOSED_DIR);
}

function subdirectories(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory()).sort();
}

/** Ids of the change directories directly under `.grace5/changes/`; `closed/` itself is not one. */
export function listChanges(root: string): string[] {
  return subdirectories(changesDir(root)).filter((name) => name !== CLOSED_DIR);
}

/** Ids of the change directories under `.grace5/changes/closed/`. */
export function listClosedChanges(root: string): string[] {
  return subdirectories(closedDir(root));
}

export interface Location {
  readonly dir: string;
  /** Relative to the root, forward slashes, no trailing slash. */
  readonly path: string;
  readonly inClosedDir: boolean;
  /** The id has a directory in both places; the open one is read and the change is malformed. */
  readonly duplicate: boolean;
}

/** Where a change id lives: directly under `.grace5/changes/` first, then under `closed/`. Undefined when it is in neither. */
export function locateChange(root: string, id: string): Location | undefined {
  const open = existsSync(join(changesDir(root), id));
  const closed = existsSync(join(closedDir(root), id));
  if (!open && !closed) return undefined;
  if (open) return { dir: join(changesDir(root), id), path: `${CHANGES_DIR}${id}`, inClosedDir: false, duplicate: closed };
  return { dir: join(closedDir(root), id), path: `${CHANGES_DIR}${CLOSED_DIR}/${id}`, inClosedDir: true, duplicate: false };
}

export function readSource(root: string): SourceState | undefined {
  const git = openGit(root);
  if (git === undefined) return undefined;
  const revision = headRevision(git);
  return { git, revision, candidate: revision === undefined ? undefined : candidateOf(git, revision), dirty: dirtyPaths(git) };
}

/** Whether the approval that governs execution binds this check's current definition. */
export function mayRun(state: ChangeState, check: Check): boolean {
  return state.executionApproval?.bound.some((b) => b.check === check.id && b.definitionSha256 === check.definitionSha256) ?? false;
}

function authorizationOf(contract: Contract, sha256: string, approval: Approval | undefined): Authorization {
  if (approval === undefined) return "unapproved";
  if (approval.decision === "rejected") return "rejected";
  if (approval.contractSha256 !== sha256) return "altered after approval";
  return "approved";
}

function authorizationObligation(authorization: Authorization, revision: number): string | undefined {
  switch (authorization) {
    case "unapproved":
    case "rejected":
      return `no approval for revision ${String(revision)}`;
    case "altered after approval":
      return "contract altered after approval";
    case "approved":
      return undefined;
  }
}

function checkState(check: Check, runs: readonly RunRecord[], candidate: string | undefined): CheckState {
  let current: CheckState["current"];
  for (const run of runs) {
    const result = run.results.find((r) => r.check === check.id);
    if (result !== undefined) current = { run, result };
  }
  let reason: string | undefined;
  // The order of the sentence of step 6: passed, clean, on the final candidate, with the current definition hash.
  if (current === undefined) reason = "no result";
  else if (current.result.verdict !== "passed") reason = `current result is ${current.result.verdict}`;
  else if (check.kind === "manual" && current.result.observation === undefined) reason = "current result is passed without an observation";
  else if (current.run.dirty) reason = "recorded dirty";
  else if (candidate === undefined || current.run.candidate !== candidate) reason = "recorded on an earlier candidate";
  else if (current.result.definitionSha256 !== check.definitionSha256) reason = "definition changed since the result";
  else if (!check.required) reason = "not required";
  return { check, current, counts: reason === undefined, reason };
}

interface ReviewBasis {
  readonly contract: Contract;
  readonly contractSha256: string;
  readonly candidate: string | undefined;
  readonly startRevision: string | undefined;
  /** The candidate a revision carries, or undefined when the revision does not resolve. */
  readonly candidateOfRevision: (revision: string) => string | undefined;
}

function reviewObligation(review: Review | undefined, basis: ReviewBasis): string | undefined {
  const { contract, candidate } = basis;
  if (review === undefined) return "no review";
  if (review.status !== "completed") return "review is incomplete";
  // In the order of step 8: the current contract hash, then the complete diff from the start revision to a commit of the final candidate.
  if (review.revision !== contract.revision || review.contractSha256 !== basis.contractSha256) return "review covers an earlier revision";
  if (review.startRevision !== basis.startRevision) return "review does not cover the complete diff";
  if (review.candidate !== candidate || basis.candidateOfRevision(review.endRevision) !== candidate) return "review covers an earlier candidate";
  const open = review.findings.find((f) => f.severity === "blocking" && f.status === "open");
  if (open !== undefined) return `blocking finding ${open.id} is open`;
  // A blocking finding is disposed of only by the owner's recorded decision.
  const undecided = review.findings.find((f) => f.severity === "blocking" && f.status === "owner-disposed" && (f.ownerDecision ?? "") === "");
  if (undecided !== undefined) return `blocking finding ${undecided.id} is disposed without an owner decision`;
  for (const check of contract.checks.filter((c) => c.required)) {
    const adequacy = review.adequacy.filter((a) => a.check === check.id);
    if (adequacy.length === 0) return `no adequacy statement for check ${check.id}`;
    if (adequacy.some((a) => !a.discriminates)) return `check ${check.id} does not discriminate`;
  }
  const violated = review.rules.find((r) => r.verdict === "violated");
  if (violated !== undefined) return `rule violated: ${violated.rule}`;
  return undefined;
}

/** Evaluates one change. Reads everything and changes nothing. */
export async function evaluate(root: string, id: string, sharedSource?: SourceState | undefined): Promise<ChangeState> {
  const location = locateChange(root, id) ?? { dir: join(changesDir(root), id), path: `${CHANGES_DIR}${id}`, inClosedDir: false, duplicate: false };
  const dir = location.dir;
  const contractPath = join(dir, "contract.xml");
  const report = existsSync(contractPath) ? await readContract(readFileSync(contractPath), { root }) : undefined;
  const records = await loadRecords(dir, id);
  const contract = report?.contract;

  const contractDefects: string[] = report === undefined ? ["contract.xml is missing"] : [...report.defects];
  if (contract !== undefined && contract.id !== id) contractDefects.push(`contract.xml: id ${contract.id} is not the directory name ${id}`);
  // The layout rules of commands.md: a directory under closed/ carries its close record, and an id lives in one place.
  const locationDefects: string[] = [];
  if (location.inClosedDir && !records.closeExists) locationDefects.push(CLOSE_RECORD_MISSING);
  if (location.duplicate) locationDefects.push(`the change exists under both ${CHANGES_DIR} and ${CHANGES_DIR}${CLOSED_DIR}/`);
  const malformed = contractDefects[0] ?? locationDefects[0] ?? records.defects[0];
  const unusedDefects = (report?.unused ?? []).map((check) => `check ${check} serves no criterion (unused)`);
  const defects: string[] = [...contractDefects, ...locationDefects, ...unusedDefects, ...records.defects];

  const approval = contract === undefined ? undefined : records.approvals.get(contract.revision);
  const brief = contract === undefined ? undefined : records.briefs.get(contract.revision);
  const authorization = contract === undefined || report === undefined ? "unapproved" : authorizationOf(contract, report.sha256, approval);

  // A brief is validated only for a legacy approval that names one: a new approval carries no `brief-sha256` and
  // requires no brief, and a brief file on disk is never inferred from. The file name decides the revision; a meta
  // that disagrees is a defect.
  const legacyBrief = approval?.briefSha256 !== undefined;
  const currentBriefDefects: string[] = [];
  if (contract !== undefined && report !== undefined && legacyBrief) {
    // Check rule 6: the brief of the contract's revision carries the current hash and passes every fidelity rule.
    // Briefs of other revisions are history.
    for (const file of records.briefs.values()) {
      const stated = file.brief.meta.get("grace5:revision");
      const named = file.revision === contract.revision;
      if (!named && stated !== String(contract.revision)) continue;
      if (stated !== String(file.revision)) currentBriefDefects.push(`${file.file}: grace5:revision is ${stated ?? "missing"}, the file name says ${String(file.revision)}`);
      if (!named) continue;
      for (const defect of briefDefects(file.brief, { contract, sha256: report.sha256, words: report.words })) currentBriefDefects.push(`${file.file}: ${defect}`);
    }
    defects.push(...currentBriefDefects);
  }
  if (contract !== undefined && report !== undefined) {
    // Check rule 7.
    for (const record of records.approvals.values()) {
      if (record.decision === "rejected") continue;
      if (record.revision !== contract.revision || record.contractSha256 !== report.sha256) continue;
      for (const check of contract.checks) {
        const bound = record.bound.filter((b) => b.check === check.id);
        if (bound.length !== 1) defects.push(`${record.file}: ${String(bound.length)} Bound elements for check ${check.id}`);
        else if (bound[0]?.definitionSha256 !== check.definitionSha256) defects.push(`${record.file}: Bound of check ${check.id} is not the hash of its definition`);
      }
      for (const b of record.bound) if (!contract.checks.some((c) => c.id === b.check)) defects.push(`${record.file}: Bound names ${b.check}, which is not a check`);
    }
  }

  // Check rule 8: a rejection carries its reason, so the next revision has it.
  for (const record of records.approvals.values()) {
    if (record.decision === "rejected" && record.statement.trim() === "") {
      defects.push(`${record.file}: a rejection carries no Statement as its reason`);
    }
  }

  // The current approval governs execution; while the current revision is unapproved, rejected or altered,
  // the last approval governs the checks it still binds. Legacy execution fields have no meaning.
  let executionApproval: Approval | undefined;
  if (contract !== undefined) {
    if (authorization === "approved") executionApproval = approval;
    else {
      const earlier = [...records.approvals.values()].filter((a) => a.decision === "approved" && a.revision <= contract.revision);
      executionApproval = earlier.sort((a, b) => b.revision - a.revision)[0];
    }
  }

  const startRun = records.runs.find((run) => run.start);
  const source = sharedSource ?? readSource(root);
  const candidate = source?.candidate;

  const changed = new Set<string>(source?.dirty ?? []);
  let startUnresolved = false;
  if (startRun !== undefined && source?.revision !== undefined) {
    const committed = changedBetween(source.git, startRun.sourceRevision, source.revision);
    // A diff that cannot be computed is not a diff that touches nothing.
    if (committed === undefined) startUnresolved = true;
    for (const path of committed ?? []) changed.add(path);
  } else if (startRun === undefined) changed.clear();
  const blocking = defects.filter((defect) => !unusedDefects.includes(defect));
  const changedList = [...changed].sort();
  const protectedTouched = contract === undefined ? [] : changedList.filter((path) => matchesAny(contract.protectedPaths, path));
  const outside = contract === undefined ? [] : changedList.filter((path) => !matchesAny(contract.protectedPaths, path) && !matchesAny(contract.paths, path));

  const checks = (contract?.checks ?? []).map((check) => checkState(check, records.runs, candidate));
  const review = records.reviews[records.reviews.length - 1];
  const receipts = new Set(records.runs.map((run) => run.n));
  const interrupted = [...new Set([...records.logDirs.filter((n) => !receipts.has(n)), ...records.runs.filter((run) => run.status === "interrupted").map((run) => run.n)])].sort((a, b) => a - b);

  const obligation = ((): string | undefined => {
    if (malformed !== undefined || contract === undefined || report === undefined) return `change is malformed: ${malformed ?? "contract.xml could not be read"}`;
    // Step 1: no blocking defect of check, and the approval. A defect of a legacy approval's current brief is named
    // after the state of the approval, because a contract altered after approval makes that brief defective and the
    // alteration is the cause.
    const other = blocking.find((defect) => !currentBriefDefects.includes(defect));
    if (other !== undefined) return `change has defects: ${other}`;
    const unauthorized = authorizationObligation(authorization, contract.revision);
    if (unauthorized !== undefined) return unauthorized;
    if (blocking[0] !== undefined) return `change has defects: ${blocking[0]}`;
    // A missing or wrong Bound of the current approval is already a defect of check (rule 7), so this is a second guard.
    const unbound = contract.checks.find((check) => !(approval?.bound.some((b) => b.check === check.id && b.definitionSha256 === check.definitionSha256) ?? false));
    if (unbound !== undefined) return `approval does not bind check ${unbound.id}`;
    // Step 2: only a legacy approval names a brief. A new approval has no brief obligation.
    if (legacyBrief) {
      if (brief === undefined) return `no brief for revision ${String(contract.revision)}`;
      if (brief.brief.meta.get("grace5:contract-sha256") !== report.sha256 || brief.sha256 !== approval?.briefSha256) return "brief does not match the approval";
    }
    // Step 3: a start run whose source revision resolves in the repository.
    if (startRun === undefined) return "no start run";
    if (source === undefined) return "not a git repository";
    if (source.revision === undefined) return "no source revision";
    if (startUnresolved) return "start revision cannot be resolved";
    // Step 4.
    if (source.dirty.length > 0) return "working tree is dirty";
    // Step 5.
    if (protectedTouched[0] !== undefined) return `protected path touched: ${protectedTouched[0]}`;
    // Steps 6 and 7.
    for (const manual of [false, true]) {
      const unmet = checks.find((c) => c.check.required && (c.check.kind === "manual") === manual && !c.counts);
      if (unmet !== undefined) return `check ${unmet.check.id}: ${unmet.reason ?? "no result"}`;
    }
    // Step 8.
    const git = source.git;
    return reviewObligation(review, { contract, contractSha256: report.sha256, candidate, startRevision: startRun.sourceRevision, candidateOfRevision: (revision) => candidateOf(git, revision) });
  })();

  return {
    id,
    path: location.path,
    dir,
    inClosedDir: location.inClosedDir,
    report,
    contract,
    records,
    malformed,
    defects,
    blocking,
    briefDefects: currentBriefDefects,
    startUnresolved,
    authorization,
    approval,
    executionApproval,
    brief,
    startRun,
    source,
    outside,
    protectedTouched,
    checks,
    review,
    interrupted,
    closed: records.closeExists,
    obligation,
  };
}

/** The `next:` text of status: the first unmet step of close, or what remains when none is. */
export function nextOf(state: ChangeState): string {
  if (state.closed) return "none, the change is closed";
  return state.obligation ?? "close";
}

export type Selection = { readonly id: string } | { readonly error: string; readonly usage: boolean };

/** Whether a change directly under `.grace5/changes/` is open: its close record does not exist. */
export function isOpen(root: string, id: string): boolean {
  return !existsSync(join(changesDir(root), id, "records", "close.xml"));
}

/** The named change, found in either location, or the single open change when none is named (commands.md). */
export function selectChange(root: string, named: string | undefined): Selection {
  const all = listChanges(root);
  if (named !== undefined) {
    const everywhere = [...new Set([...all, ...listClosedChanges(root)])].sort();
    if (everywhere.includes(named)) return { id: named };
    const prefixed = everywhere.filter((id) => id.startsWith(`${named}-`));
    const only = prefixed[0];
    if (prefixed.length === 1 && only !== undefined) return { id: only };
    return { error: `change ${named} not found under ${CHANGES_DIR} or ${CHANGES_DIR}${CLOSED_DIR}/`, usage: false };
  }
  const open = all.filter((id) => isOpen(root, id));
  const single = open[0];
  if (open.length === 1 && single !== undefined) return { id: single };
  if (open.length === 0) return { error: `no open change under ${CHANGES_DIR}; name one`, usage: true };
  return { error: `${String(open.length)} changes are open (${open.join(", ")}); name one`, usage: true };
}
