// grace5 status (commands.md): reads everything and changes nothing.

import { evaluate, listChanges, listClosedChanges, nextOf, readSource, selectChange, type ChangeState } from "../state";

function describe(state: ChangeState): string[] {
  const lines: string[] = [`change: ${state.id}`];
  if (state.malformed !== undefined) lines.push(`malformed: ${state.malformed}`);
  lines.push(`revision: ${state.contract === undefined ? "unknown" : String(state.contract.revision)}`);
  lines.push(`authorization: ${state.authorization}`);
  lines.push(`start: ${state.startRun?.sourceRevision ?? "none"}`);
  const source = state.source;
  if (source === undefined) lines.push("candidate: none (not a git repository)");
  else if (source.candidate === undefined) lines.push("candidate: none (no commit)");
  else lines.push(`candidate: ${source.candidate} (${source.dirty.length > 0 ? "dirty" : "clean"})`);
  for (const path of state.outside) lines.push(`outside: ${path}`);
  for (const path of state.protectedTouched) lines.push(`protected: ${path}`);
  for (const check of state.checks) {
    const verdict = check.current?.result.verdict ?? "no result";
    lines.push(`check ${check.check.id}: ${verdict}${check.counts ? ", counts" : `, does not count: ${check.reason ?? ""}`}`);
  }
  const review = state.review;
  if (review === undefined) lines.push("review: none");
  else {
    const open = review.findings.filter((f) => f.status === "open").map((f) => `${f.id} (${f.severity})`);
    const where = review.candidate === source?.candidate ? "on the current candidate" : "on an earlier candidate";
    lines.push(`review: review-${String(review.n)} ${review.status}, ${where}, open findings: ${open.length === 0 ? "none" : open.join(", ")}`);
  }
  for (const n of state.interrupted) lines.push(`interrupted: run-${String(n)}`);
  if (state.closed) lines.push(`closed: ${state.path}/records/close.xml`);
  lines.push(`next: ${nextOf(state)}`);
  return lines;
}

export async function statusCommand(root: string, change: string | undefined, all = false): Promise<number> {
  if (change !== undefined) {
    const selection = selectChange(root, change);
    if ("error" in selection) {
      console.error(`refused: ${selection.error}`);
      return 1;
    }
    for (const line of describe(await evaluate(root, selection.id))) console.log(line);
    return 0;
  }
  // The listing (commands.md): one line per open change, a malformed one never hiding the others; the closed changes,
  // moved under closed/ or not, are counted on the last line and listed one line each only with --all.
  const source = readSource(root);
  const closedLines: string[] = [];
  let closed = 0;
  const ids = [...new Set([...listChanges(root), ...listClosedChanges(root)])].sort();
  for (const id of ids) {
    try {
      const state = await evaluate(root, id, source);
      if (state.malformed !== undefined) {
        const line = `${id}: malformed: ${state.malformed}`;
        if (state.inClosedDir) closedLines.push(line);
        else console.log(line);
      } else if (state.closed) {
        closed++;
        if (all) closedLines.push(`${id}: closed`);
      } else console.log(`${id}: ${state.authorization}, next: ${nextOf(state)}`);
    } catch (error) {
      console.log(`${id}: malformed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const line of closedLines) console.log(line);
  console.log(`closed changes: ${String(closed)}`);
  return 0;
}
