// Verifies the worked examples with the kernel's own contract validation and brief fidelity check.
// A to D must be clean; defective-brief must be reported with exactly the omitted protected path named.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { briefDefects, readBrief } from "../brief";
import { readContract } from "../contract";
import { loadRecords } from "../records";
import { evaluate, listClosedChanges } from "../state";

const EXAMPLES = resolve(import.meta.dir, "..", "..", "models", "architecture", "examples");
const DEFECTIVE = "defective-brief";

/** Every defect of one example: the contract's (rule paths excepted, since an example has no repository) and each brief's. */
async function defectsOf(dir: string): Promise<string[]> {
  const contractPath = join(dir, "contract.xml");
  if (!existsSync(contractPath)) return ["contract.xml is missing"];
  const report = await readContract(readFileSync(contractPath));
  const defects = [...report.defects];
  const contract = report.contract;
  if (contract === undefined) return defects;
  const records = join(dir, "records");
  defects.push(...(await loadRecords(dir, contract.id)).defects);
  const briefs = existsSync(records) ? readdirSync(records).filter((name) => /^brief-[1-9][0-9]*\.html$/.test(name)).sort() : [];
  if (briefs.length === 0) defects.push("no brief");
  for (const name of briefs) {
    const brief = readBrief(readFileSync(join(records, name), "utf8"));
    for (const defect of briefDefects(brief, { contract, sha256: report.sha256, words: report.words })) defects.push(`${name}: ${defect}`);
  }
  return defects;
}

async function main(): Promise<number> {
  const names = readdirSync(EXAMPLES).filter((name) => statSync(join(EXAMPLES, name)).isDirectory()).sort();
  let failed = !names.includes(DEFECTIVE) || names.length < 5;
  if (failed) console.log(`examples: expected four clean examples and ${DEFECTIVE}, found ${names.join(", ") || "none"}`);
  for (const name of names) {
    const defects = await defectsOf(join(EXAMPLES, name));
    if (name === DEFECTIVE) {
      const contract = (await readContract(readFileSync(join(EXAMPLES, name, "contract.xml")))).contract;
      const expected = (contract?.protectedPaths ?? []).map((path) => `brief-1.html: protected path ${path} is missing`);
      const exposed = defects.length === 1 && expected.includes(defects[0] ?? "");
      if (exposed) console.log(`${name}: reported as required (${defects[0] ?? ""})`);
      else {
        failed = true;
        console.log(`${name}: FAILED, expected exactly one omitted protected path, got: ${defects.join("; ") || "no defect"}`);
      }
    } else if (defects.length === 0) console.log(`${name}: clean`);
    else {
      failed = true;
      console.log(`${name}: FAILED, ${defects.join("; ")}`);
    }
  }
  const root = resolve(EXAMPLES, "..", "..", "..");
  for (const id of listClosedChanges(root)) {
    const state = await evaluate(root, id);
    if (state.defects.length === 0) console.log(`${id}: historical records clean`);
    else {
      failed = true;
      console.log(`${id}: FAILED, ${state.defects.join("; ")}`);
    }
  }
  return failed ? 1 : 0;
}

process.exitCode = await main();
