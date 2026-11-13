// grace5 upgrade (upgrade.md, commands.md): composes the migration chain from the pin to the kernel's version and applies it.

import { openGit } from "../git";
import { kernelVersion } from "../records";
import { isOpen, listChanges } from "../state";
import { applyUpgrade } from "../upgrade/chain";
import { compareVersions, readPin } from "../upgrade/pin";
import { STEPS } from "../upgrade/steps";

function refuse(reason: string): number {
  console.error(`refused: ${reason}`);
  return 1;
}

export async function upgradeCommand(root: string, plan: boolean): Promise<number> {
  if (openGit(root) === undefined) return refuse("not a git repository");
  const pin = readPin(root);
  if (pin === undefined) return refuse(".grace5/ does not exist: run grace5 init");
  const open = listChanges(root).filter((id) => isOpen(root, id));
  if (open.length > 0) return refuse(`open changes: ${open.join(", ")}`);
  const version = kernelVersion();
  const order = compareVersions(pin, version);
  if (order > 0) return refuse(`repository state is at ${pin}, kernel is ${version}: kernel too old`);
  if (order === 0) {
    console.log(`up to date: ${version}`);
    return 0;
  }
  return applyUpgrade({ root, version, steps: STEPS, plan, print: (line) => console.log(line) });
}
