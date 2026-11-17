// grace5 close (evidence-records.md, "What close verifies"): writes close.xml or refuses at the first unmet step.

import { existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { CHANGES_DIR } from "../git";
import { closeNode, kernelName, writeRecord, type CloseRecord } from "../records";
import { CLOSED_DIR, closedDir, evaluate, selectChange } from "../state";

function refuse(reason: string): number {
  console.error(`refused: ${reason}`);
  return 1;
}

export async function closeCommand(root: string, change: string | undefined): Promise<number> {
  const selection = selectChange(root, change);
  if ("error" in selection) {
    if (selection.usage) {
      console.error(`usage: ${selection.error}`);
      return 2;
    }
    return refuse(selection.error);
  }
  const state = await evaluate(root, selection.id);
  if (state.closed) return refuse("change is closed");
  if (state.obligation !== undefined) return refuse(state.obligation);
  const { contract, report, source, startRun, brief, approval, review } = state;
  // A legacy approval names a brief and needs it; a new approval has none and the evaluation carries none.
  if (contract === undefined || report === undefined || source?.revision === undefined || source.candidate === undefined || startRun === undefined || approval === undefined || review === undefined || (approval.briefSha256 !== undefined && brief === undefined)) {
    return refuse("change is malformed: the evaluation is incomplete");
  }
  const record: CloseRecord = {
    change: state.id,
    revision: contract.revision,
    contractSha256: report.sha256,
    date: new Date().toISOString(),
    sourceRevision: source.revision,
    candidate: source.candidate,
    startRevision: startRun.sourceRevision,
    brief: brief?.file,
    approval: approval.file,
    review: review.n,
    kernel: kernelName(),
    satisfied: state.checks.filter((c) => c.check.required).map((c) => ({
      check: c.check.id,
      kind: c.check.kind,
      run: c.current?.run.n ?? 0,
      claim: c.current?.result.claim ?? "",
    })),
    notRequired: state.checks.filter((c) => !c.check.required).map((c) => ({ check: c.check.id, verdict: c.current?.result.verdict })),
  };
  await writeRecord("close", join(state.dir, "records", "close.xml"), closeNode(record));
  // The ninth step (evidence-records.md, "What closed means"): the change is closed once close.xml exists; the whole
  // directory, untracked logs included, then moves under closed/. A move that fails leaves a closed change where it is.
  let path = state.path;
  const target = join(closedDir(root), state.id);
  try {
    if (existsSync(target)) throw new Error(`${CHANGES_DIR}${CLOSED_DIR}/${state.id} already exists`);
    mkdirSync(closedDir(root), { recursive: true });
    renameSync(state.dir, target);
    path = `${CHANGES_DIR}${CLOSED_DIR}/${state.id}`;
  } catch (error) {
    console.error(`not moved: ${error instanceof Error ? error.message : String(error)}`);
  }
  console.log(`closed: ${path}/records/close.xml`);
  return 0;
}
