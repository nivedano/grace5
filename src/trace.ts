// Trace checks (trace-provenance.md): the provenance line, the refusals, and ordered substring matching with min and max.

import type { Check, Environment, Expect } from "./contract";

export type Origin = "live" | "replay" | "fixture";
export type IdentitySource = "observed" | "declared" | "absent";

export interface Provenance {
  /** A provenance line echoed this run's id. */
  readonly echoed: boolean;
  readonly origin: Origin | undefined;
  readonly device: string | undefined;
  readonly build: string | undefined;
}

const PREFIX = "grace5-provenance:";

/** Reads the last provenance line whose `run` equals this run's id. A line naming another run is ignored. */
export function readProvenance(log: string, runId: string): Provenance {
  let found: Provenance = { echoed: false, origin: undefined, device: undefined, build: undefined };
  for (const line of log.split(/\r?\n/)) {
    const at = line.indexOf(PREFIX);
    if (at < 0) continue;
    const fields = new Map<string, string>();
    for (const token of line.slice(at + PREFIX.length).trim().split(/\s+/)) {
      const equals = token.indexOf("=");
      if (equals > 0 && !fields.has(token.slice(0, equals))) fields.set(token.slice(0, equals), token.slice(equals + 1));
    }
    const origin = fields.get("origin");
    if (fields.get("run") !== runId) continue;
    if (origin !== "live" && origin !== "replay" && origin !== "fixture") continue;
    found = { echoed: true, origin, device: fields.get("device") || undefined, build: fields.get("build") || undefined };
  }
  return found;
}

/**
 * Whether an observed or stated build satisfies the declared one. `@revision` is satisfied by a build identity that
 * contains the first eight characters of the run's revision or of an ancestor carrying the same candidate.
 */
export function buildSatisfies(declared: string, observed: string, sameCandidateRevisions: () => Iterable<string>): boolean {
  if (declared !== "@revision") return declared === observed;
  for (const revision of sameCandidateRevisions()) if (observed.includes(revision.slice(0, 8))) return true;
  return false;
}

export interface ProvenanceVerdict {
  /** A fixed refusal phrase of commands.md, or undefined when the sequence may be checked. */
  readonly refusal: string | undefined;
  readonly claim: "marker-sequence-live" | "marker-sequence-replay" | "marker-sequence-fixture" | "marker-sequence-unattributed";
  readonly deviceSource: IdentitySource;
  readonly buildSource: IdentitySource;
  readonly device: string | undefined;
  readonly build: string | undefined;
}

export function judgeProvenance(check: Check, provenance: Provenance, sameCandidateRevisions: () => Iterable<string>): ProvenanceVerdict {
  const env: Environment | undefined = check.environment;
  const required = check.origin ?? "any";
  const reported = provenance.origin ?? "unattributed";
  let refusal: string | undefined;
  if (required === "live") {
    if (!provenance.echoed) refusal = "live provenance missing";
    else if (provenance.origin !== "live") refusal = `origin is ${reported}, check requires live`;
    else if (env?.device !== undefined && provenance.device === undefined) refusal = "identity missing";
    else if (env?.device !== undefined && provenance.device !== env.device) refusal = "device mismatch";
    else if (env?.build !== undefined && provenance.build === undefined) refusal = "identity missing";
    else if (env?.build !== undefined && !buildSatisfies(env.build, provenance.build ?? "", sameCandidateRevisions)) refusal = "build mismatch";
  } else if (required !== "any" && provenance.origin !== required) {
    refusal = `origin is ${reported}, check requires ${required}`;
  }
  const source = (observed: string | undefined, declared: string | undefined): IdentitySource =>
    observed !== undefined ? "observed" : declared !== undefined ? "declared" : "absent";
  return {
    refusal,
    claim: `marker-sequence-${reported}`,
    deviceSource: source(provenance.device, env?.device),
    buildSource: source(provenance.build, env?.build),
    device: provenance.device ?? env?.device,
    build: provenance.build ?? env?.build,
  };
}

export interface SequenceResult {
  /** How many Expect markers were found in order, with their occurrence bounds met. */
  readonly matched: number;
  readonly expected: number;
  /** The first marker not found in order, or found outside its bounds. */
  readonly missing: string | undefined;
  readonly forbidden: readonly string[];
  readonly reason: string | undefined;
}

function occurrences(log: string, marker: string, from: number, to: number): number {
  let count = 0;
  for (let at = log.indexOf(marker, from); at >= 0 && at + marker.length <= to; at = log.indexOf(marker, at + marker.length)) count++;
  return count;
}

/** Each Expect is searched after the end of the previous match; min and max count a marker from its own match to the next one's. */
export function matchMarkers(log: string, expects: readonly Expect[], forbids: readonly string[]): SequenceResult {
  const starts: number[] = [];
  let position = 0;
  for (const expect of expects) {
    const at = log.indexOf(expect.marker, position);
    if (at < 0) break;
    starts.push(at);
    position = at + expect.marker.length;
  }
  let matched = starts.length;
  let missing = expects[starts.length]?.marker;
  let reason = missing === undefined ? undefined : `marker not found in order: ${missing}`;
  for (let i = 0; i < starts.length; i++) {
    const expect = expects[i];
    const start = starts[i];
    if (expect === undefined || start === undefined) continue;
    const isLast = i === expects.length - 1;
    const end = starts[i + 1] ?? (isLast ? log.length : undefined);
    // The window of the marker before the missing one has no end, so its count is not judged.
    if (end === undefined) continue;
    const count = occurrences(log, expect.marker, start, end);
    const bound = count < expect.min ? `at least ${String(expect.min)}` : expect.max !== undefined && count > expect.max ? `at most ${String(expect.max)}` : undefined;
    if (bound !== undefined) {
      matched = i;
      missing = expect.marker;
      reason = `marker occurs ${String(count)} times, ${bound} expected: ${expect.marker}`;
      break;
    }
  }
  const forbidden = forbids.filter((marker) => log.includes(marker));
  if (reason === undefined && forbidden[0] !== undefined) reason = `forbidden marker present: ${forbidden[0]}`;
  return { matched, expected: expects.length, missing, forbidden, reason };
}
