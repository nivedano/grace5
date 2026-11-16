// Change commits (rationale-ledger.md L-01, source-identity.md): a repository tool, not a kernel
// command. It constructs one change-owned commit from an explicit change id and an explicit list of
// owned paths, appends the literal `Change: <id>` trailer, and reads the created commit back -- its
// parsed trailer and its changed-path list -- before accepting it. It refuses an empty selection, a
// path with no modified content, and any missing or mismatched trailer or failed read-back; it never
// stages all dirty files, never adopts unknown work, never rewrites history and never hides a failed
// verification. A harness-native verified commit facility is preferred where it exists (D5); this
// routine is the portable fallback.

import { spawnSync } from "node:child_process";

/** The change id form for a product, record or close-move commit. */
const CHANGE_ID = /^C-[0-9]{4}(-[a-z0-9]+)*$/;

const USAGE = `usage: bun src/tools/change-commit.ts --change <id> --message <subject> [--] <path>...

Commits exactly the supplied paths for one change and verifies the created commit before accepting
it: the parsed \`Change: <id>\` trailer and the changed-path list must match the arguments. The commit
is made with \`git commit --only\`, so foreign dirty or staged work outside the supplied paths is
never staged or committed. It never amends, rewrites history or hides a failed verification.

Options:
  --change <id>       The change id, matching ${CHANGE_ID.source} (required).
  --message <subject> The commit subject; \`Change: <id>\` is appended as its own paragraph (required).
  --help, -h          Show this help.
  (after --) <path>   One or more files to commit, relative to the current directory (required).

Output (exit status 0):
  committed: <sha>
  trailer: Change: <id>
  paths: <n>

Exit status:
  0  the commit carries the Change trailer and exactly the supplied paths
  1  an empty selection, a path with no modified content, a failed commit, or a read-back mismatch
  2  a usage error`;

type Args =
  | { readonly kind: "help" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "run"; readonly change: string; readonly message: string; readonly paths: readonly string[] };

function parse(argv: readonly string[]): Args {
  let change: string | undefined;
  let message: string | undefined;
  const paths: string[] = [];
  let optionsDone = false;
  const rest = [...argv];
  while (rest.length > 0) {
    const arg = rest.shift() ?? "";
    if (!optionsDone) {
      if (arg === "--help" || arg === "-h") return { kind: "help" };
      if (arg === "--") {
        optionsDone = true;
        continue;
      }
      if (arg === "--change" || arg === "--message") {
        const value = rest.shift();
        if (value === undefined) return { kind: "error", message: `${arg} needs a value` };
        if (arg === "--change") change = value;
        else message = value;
        continue;
      }
      if (arg.startsWith("-")) return { kind: "error", message: `unknown argument: ${arg}` };
    }
    paths.push(arg);
  }
  if (change === undefined) return { kind: "error", message: "--change <id> is required" };
  if (!CHANGE_ID.test(change)) return { kind: "error", message: `invalid change id: ${change}` };
  if (message === undefined || message.trim() === "") {
    return { kind: "error", message: "--message <subject> is required and must not be empty" };
  }
  return { kind: "run", change, message, paths };
}

interface Git {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function git(cwd: string, args: readonly string[]): Git {
  const result = spawnSync("git", [...args], { cwd, encoding: "utf8", windowsHide: true });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/** A repository path with forward slashes and no leading `./`, as git records it. */
function normalisePath(path: string): string {
  let normalised = path.replace(/\\/g, "/");
  while (normalised.startsWith("./")) normalised = normalised.slice(2);
  return normalised;
}

function refuse(reason: string): number {
  console.error(`change-commit: ${reason}`);
  return 1;
}

export function main(argv: readonly string[], cwd: string = process.cwd()): number {
  const args = parse(argv);
  if (args.kind === "help") {
    console.log(USAGE);
    return 0;
  }
  if (args.kind === "error") {
    console.error(`${USAGE.split("\n")[0] ?? ""} (${args.message})`);
    return 2;
  }

  const inside = git(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || inside.stdout.trim() !== "true") {
    return refuse(`not inside a git work tree: ${cwd}`);
  }

  if (args.paths.length === 0) return refuse("empty selection: at least one path is required");
  const selected = [...new Set(args.paths.map(normalisePath))];

  for (const path of selected) {
    const status = git(cwd, ["status", "--porcelain", "--untracked-files=all", "--", path]);
    if (status.status !== 0) return refuse(`cannot read the status of ${path}: ${status.stderr.trim()}`);
    if (status.stdout.trim() === "") return refuse(`no change: ${path}`);
  }

  // Stage only the supplied paths, so a brand-new file is known to git; `--only` below still commits
  // exactly these contents and ignores anything staged for other paths.
  const add = git(cwd, ["add", "--", ...selected]);
  if (add.status !== 0) return refuse(`cannot stage ${selected.join(", ")}: ${(add.stderr || add.stdout).trim()}`);

  const commit = git(cwd, ["commit", "--only", "-m", args.message, "-m", `Change: ${args.change}`, "--", ...selected]);
  if (commit.status !== 0) return refuse(`git commit failed: ${(commit.stderr || commit.stdout).trim()}`);

  const head = git(cwd, ["rev-parse", "HEAD"]);
  if (head.status !== 0) return refuse(`cannot read HEAD: ${head.stderr.trim()}`);
  const sha = head.stdout.trim();

  const trailer = git(cwd, ["show", "-s", "--pretty=format:%(trailers:key=Change,valueonly)", "HEAD"]);
  if (trailer.status !== 0) return refuse(`cannot read the trailer of ${sha}: ${trailer.stderr.trim()}`);
  const read = trailer.stdout.trim();
  if (read !== args.change) {
    return refuse(`missing or mismatched Change trailer: expected "Change: ${args.change}", read "${read}"`);
  }

  const names = git(cwd, ["show", "--pretty=format:", "--name-only", "HEAD"]);
  if (names.status !== 0) return refuse(`cannot read the paths of ${sha}: ${names.stderr.trim()}`);
  const committed = names.stdout
    .split("\n")
    .map((line) => normalisePath(line.trim()))
    .filter((line) => line !== "")
    .sort();
  const expected = [...selected].sort();
  if (committed.length !== expected.length || committed.some((path, index) => path !== expected[index])) {
    return refuse(
      `committed path set differs from the supplied paths: supplied ${expected.join(", ")}; committed ${committed.join(", ")}`,
    );
  }

  console.log(`committed: ${sha}`);
  console.log(`trailer: Change: ${args.change}`);
  console.log(`paths: ${expected.length}`);
  return 0;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
