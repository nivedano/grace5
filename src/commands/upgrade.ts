// grace5 upgrade (upgrade.md, commands.md): composes the migration chain from the pin to the kernel's version and applies it.

import { openGit } from "../git";
import { kernelVersion } from "../records";
import { applyUpgrade } from "../upgrade/chain";
import { compareVersions, readPin, unreadablePin } from "../upgrade/pin";
import { STEPS } from "../upgrade/steps";

function refuse(reason: string): number {
  console.error(`refused: ${reason}`);
  return 1;
}

export async function upgradeCommand(root: string, plan: boolean): Promise<number> {
  if (openGit(root) === undefined) return refuse("not a git repository");
  let pin: string | undefined;
  try {
    pin = readPin(root);
  } catch (error) {
    return refuse(unreadablePin(error));
  }
  if (pin === undefined) return refuse(".grace5/ does not exist: run grace5 init");
  const version = kernelVersion();
  const order = compareVersions(pin, version);
  if (order > 0) return refuse(`repository state is at ${pin}, kernel is ${version}: kernel too old`);
  if (order === 0) {
    console.log(`up to date: ${version}`);
    return 0;
  }
  // The open changes are the chain's business (upgrade.md): it refuses only those a step would write.
  return applyUpgrade({ root, version, steps: STEPS, plan, print: (line) => console.log(line), refuse: (reason) => console.error(`refused: ${reason}`) });
}
