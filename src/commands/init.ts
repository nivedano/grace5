// grace5 init (commands.md): creates the entry point and, with a change id, a change directory. It overwrites nothing.

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { locateChange } from "../state";

const CHANGE_ID = /^C-[0-9]{4}(-[a-z0-9]+)*$/;

function contractTemplate(id: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Contract id="${id}" revision="1" title="What this change is, in one line">
  <Problem>The observed need, in one to three sentences.</Problem>
  <Change>What becomes true: the behavioural delta, stated once.</Change>
  <Constraints>
    <Constraint id="K1">What must hold. Add rule="path/to/rule.md" to cite a standing project rule instead of restating it.</Constraint>
  </Constraints>
  <NonGoals>
    <NonGoal id="N1">What the change deliberately leaves alone.</NonGoal>
  </NonGoals>
  <Acceptance>
    <Criterion id="A1" checks="CK1">A criterion, naming the checks that serve it.</Criterion>
  </Acceptance>
  <Affected>
    <Path>path/or/glob/the/change/may/write/**</Path>
    <Name>A project-native name, such as a component or a wire boundary</Name>
    <Protected>path/or/glob/the/change/must/not/write/**</Protected>
  </Affected>
  <Checks>
    <Automated id="CK1" budget="120">
      <Command>the project command that must exit 0</Command>
    </Automated>
  </Checks>
  <Decisions>
    <Decision id="D1">An owner decision made during preparation, in one line.</Decision>
  </Decisions>
</Contract>
`;
}

function readme(root: string): string {
  const links: string[] = [];
  for (const name of readdirSync(root).sort()) {
    const isFile = statSync(join(root, name)).isFile();
    if (isFile && (/^readme(\.[a-z]+)?$/i.test(name) || name === "AGENTS.md" || name === "CLAUDE.md")) links.push(`- [${name}](../${name})`);
    else if (!isFile && (name === "docs" || name === "models")) links.push(`- [${name}/](../${name}/)`);
  }
  return [
    "# .grace5",
    "",
    "GRACE 5 state of this repository: one directory per open change under `changes/`, each holding `contract.xml`, an optional `notes.md` and `records/` (brief, approval, run receipts, review, close); `grace5 close` moves a closed change to `changes/closed/`.",
    "",
    "The commands are `grace5 init`, `check`, `run`, `status` and `close`; `grace5 --help` describes them.",
    "",
    "Project documents and rule files found when this file was created:",
    "",
    ...(links.length > 0 ? links : ["- none found"]),
    "",
  ].join("\n");
}

export function initCommand(root: string, change: string | undefined): number {
  if (change !== undefined && !CHANGE_ID.test(change)) {
    console.error(`usage: ${change} is not a change id (C-NNNN with an optional lower-case slug, for example C-0007-empty-export)`);
    return 2;
  }
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error(`refused: ${root} is not a directory`);
    return 1;
  }
  // A change id is unique across open and closed (commands.md): an existing directory in either place refuses the id.
  const existing = change === undefined ? undefined : locateChange(root, change);
  if (existing !== undefined) {
    console.error(`refused: change ${change ?? ""} exists at ${existing.path}/`);
    return 1;
  }
  const report = (path: string, created: boolean): void => console.log(`${created ? "created" : "exists"}: ${path}`);
  const directory = (relative: string): void => {
    const path = join(root, relative);
    const present = existsSync(path);
    if (!present) mkdirSync(path, { recursive: true });
    report(`${relative}/`, !present);
  };
  const file = (relative: string, contents: () => string): void => {
    const path = join(root, relative);
    const present = existsSync(path);
    if (!present) writeFileSync(path, contents(), { flag: "wx" });
    report(relative, !present);
  };
  directory(".grace5/changes");
  file(".grace5/README.md", () => readme(root));
  if (change !== undefined) {
    directory(`.grace5/changes/${change}`);
    directory(`.grace5/changes/${change}/records`);
    file(`.grace5/changes/${change}/contract.xml`, () => contractTemplate(change));
  }
  return 0;
}
