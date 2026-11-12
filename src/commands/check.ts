// grace5 check (commands.md): validates the selected change and executes nothing.

import { TARGET_CHECKS, TARGET_WORDS } from "../contract";
import { evaluate, selectChange } from "../state";

export async function checkCommand(root: string, change: string | undefined): Promise<number> {
  const selection = selectChange(root, change);
  if ("error" in selection) {
    if (selection.usage) {
      console.error(`usage: ${selection.error}`);
      return 2;
    }
    console.log(`defect: ${selection.error}`);
    return 1;
  }
  const state = await evaluate(root, selection.id);
  if (state.report !== undefined) {
    console.log(`contract-sha256: ${state.report.sha256}`);
    for (const check of state.contract?.checks ?? []) console.log(`definition ${check.id}: ${check.definitionSha256}`);
    console.log(`words: ${String(state.report.words)} (target ${String(TARGET_WORDS)})`);
    if (state.contract !== undefined) console.log(`checks: ${String(state.contract.checks.length)} (target ${String(TARGET_CHECKS)})`);
  }
  for (const defect of state.defects) console.log(`defect: ${defect}`);
  return state.defects.length === 0 ? 0 : 1;
}
