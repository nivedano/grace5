// The upgrade chain (upgrade.md): composed from the pinned version to the kernel's, printed as a plan, applied in order
// with the pin written after each link, and checked afterwards against a snapshot of every change's hashes and defects.

import { evaluate, isOpen, listChanges, listClosedChanges, readSource } from "../state";
import { modifiedSkillSources } from "./kernel-source";
import { compareVersions, readPin, writePin } from "./pin";
import { refreshSkills } from "./skills";
import { type Step } from "./steps";

export type Link = { readonly kind: "step"; readonly step: Step } | { readonly kind: "bump"; readonly from: string; readonly to: string };

/** The chain from `pin` to `version`: at each boundary the step that starts there, or a bump to the next step's start or to `version`. */
export function composeChain(pin: string, version: string, steps: readonly Step[]): Link[] {
  const links: Link[] = [];
  let current = pin;
  const ordered = [...steps].sort((a, b) => compareVersions(a.from, b.from));
  while (compareVersions(current, version) < 0) {
    const next = ordered.find((step) => compareVersions(step.from, current) >= 0 && compareVersions(step.to, version) <= 0);
    if (next !== undefined && next.from === current) {
      links.push({ kind: "step", step: next });
      current = next.to;
    } else {
      const to = next === undefined ? version : next.from;
      links.push({ kind: "bump", from: current, to });
      current = to;
    }
  }
  return links;
}

export function describeLink(link: Link): string {
  if (link.kind === "step") return `step: ${link.step.from} -> ${link.step.to}: ${link.step.describe}`;
  return `bump: ${link.from} -> ${link.to}: no step for this boundary, the pin advances`;
}

export interface ChangeSnapshot {
  readonly contractSha256: string | undefined;
  readonly definitions: ReadonlyMap<string, string>;
  readonly defects: readonly string[];
}

/** Every change in both locations: its contract hash, definition hashes and defects, as `check` reports them. */
export async function snapshot(root: string): Promise<Map<string, ChangeSnapshot>> {
  const source = readSource(root);
  const result = new Map<string, ChangeSnapshot>();
  for (const id of [...new Set([...listChanges(root), ...listClosedChanges(root)])].sort()) {
    const state = await evaluate(root, id, source);
    result.set(id, {
      contractSha256: state.report?.sha256,
      definitions: new Map((state.contract?.checks ?? []).map((check) => [check.id, check.definitionSha256])),
      defects: state.defects,
    });
  }
  return result;
}

/** The first difference between two snapshots that an upgrade may not make, as `<id>: <reason>`, or undefined. */
export function snapshotDifference(before: ReadonlyMap<string, ChangeSnapshot>, after: ReadonlyMap<string, ChangeSnapshot>): string | undefined {
  for (const [id, was] of before) {
    const now = after.get(id);
    if (now === undefined) return `${id}: missing after the upgrade`;
    if (was.contractSha256 !== now.contractSha256) return `${id}: contract hash changed`;
    for (const [check, hash] of was.definitions) if (now.definitions.get(check) !== hash) return `${id}: definition hash of ${check} changed`;
    for (const check of now.definitions.keys()) if (!was.definitions.has(check)) return `${id}: definition hash of ${check} changed`;
    const fresh = now.defects.find((defect) => !was.defects.includes(defect));
    if (fresh !== undefined) return `${id}: ${fresh}`;
  }
  for (const id of after.keys()) if (!before.has(id)) return `${id}: not present before the upgrade`;
  return undefined;
}

export interface UpgradeInput {
  readonly root: string;
  /** The version to upgrade to: the running kernel's. */
  readonly version: string;
  readonly steps: readonly Step[];
  readonly plan: boolean;
  readonly print: (line: string) => void;
  /** Receives a refusal reason (commands.md); the command prints it as `refused: <reason>` on standard error. */
  readonly refuse?: (reason: string) => void;
  /** The packaged skills directory; the kernel's own by default. */
  readonly packagedSkills?: string;
  /** The kernel checkout whose skill sources must be clean; the running checkout by default. */
  readonly kernelRoot?: string;
}

/**
 * Composes and applies the chain. The caller has already refused what comes before the chain (not a git repository, no
 * .grace5/, kernel too old, up to date); this refuses on the open changes a step would write, on a kernel checkout whose
 * skill source differs from HEAD when a step exists, prints the plan, applies the links, and returns the exit status.
 * Every path a step or the skill refresh writes is kernel-managed (source-identity.md), so an open change's candidate
 * and diff are unchanged by the chain.
 */
export async function applyUpgrade(input: UpgradeInput): Promise<number> {
  const { root, version, print } = input;
  const refuse = input.refuse ?? ((reason: string): void => print(`refused: ${reason}`));
  const pin = readPin(root);
  if (pin === undefined) throw new Error(".grace5/ does not exist");
  const chain = composeChain(pin, version, input.steps);
  const steps = chain.flatMap((link) => (link.kind === "step" ? [link.step] : []));
  // The open changes (upgrade.md): a step that would write one is refused with no override.
  const open = listChanges(root).filter((id) => isOpen(root, id));
  for (const step of steps) {
    const touched = step.touches(root).filter((id) => open.includes(id)).sort();
    if (touched.length > 0) {
      refuse(`open changes touched by step ${step.from} -> ${step.to}: ${touched.join(", ")}`);
      return 1;
    }
  }
  if (steps.length > 0) {
    const modified = modifiedSkillSources(input.kernelRoot);
    if (modified.length > 0) {
      refuse(`kernel skills are modified relative to HEAD: ${modified.join(", ")} (commit them or run from a released commit)`);
      return 1;
    }
  }
  for (const link of chain) print(describeLink(link));
  if (open.length > 0) print(`open, untouched: ${open.join(", ")}`);
  if (input.plan) return 0;
  const before = await snapshot(root);
  for (const link of chain) {
    const from = link.kind === "step" ? link.step.from : link.from;
    const to = link.kind === "step" ? link.step.to : link.to;
    try {
      if (link.kind === "step") {
        // Applied, the skills refreshed, then verified: a step may count the installed skills as part of its shape.
        link.step.apply(root, input.packagedSkills);
        const refreshed = refreshSkills(root, input.packagedSkills);
        if (refreshed.length === 0) print("skills: none installed");
        for (const path of refreshed) print(`refreshed: ${path}`);
        link.step.verify(root, input.packagedSkills);
      }
      writePin(root, to);
    } catch (error) {
      print(`failed: ${from} -> ${to}: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }
    print(`pinned: ${to}`);
  }
  const after = await snapshot(root);
  const difference = snapshotDifference(before, after);
  if (difference !== undefined) {
    print(`failed: post-upgrade check: ${difference}`);
    return 1;
  }
  for (const id of after.keys()) print(`checked: ${id}`);
  print(`upgraded: ${pin} -> ${version}`);
  return 0;
}
