// grace5 close (evidence-records.md, "What close verifies"): writes close.xml or refuses at the first unmet step.

import { join } from "node:path";
import { closeNode, kernelName, writeRecord, type CloseRecord } from "../records";
import { evaluate, selectChange } from "../state";

function refuse(reason: string): number {
  console.log(`refused: ${reason}`);
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
  if (contract === undefined || report === undefined || source?.revision === undefined || source.candidate === undefined || startRun === undefined || brief === undefined || approval === undefined || review === undefined) {
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
    brief: brief.file,
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
  console.log(`closed: ${state.path}/records/close.xml`);
  return 0;
}
