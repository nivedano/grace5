// Conformance cases CK2 of C-0013-verified-change-commits for the change-commit tool
// (rationale-ledger.md L-01, source-identity.md): the routine constructs the `Change: <id>` trailer,
// commits exactly the supplied paths, reads the created commit back, leaves foreign dirty work
// uncommitted, refuses an empty selection and a path with no change, reports a read-back mismatch and
// still leaves the failed commit visible, and never rewrites the hash of an earlier commit. Every
// repository is a throwaway temporary directory; this repository's git state is never read.

import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const TOOL = resolve(import.meta.dir, "change-commit.ts");
const TIMEOUT = 60_000;

const TEMP_DIRS: string[] = [];

afterAll(() => {
  for (const dir of TEMP_DIRS) rmSync(dir, { recursive: true, force: true });
});

/** Runs git for the test's own setup and assertions, failing loudly on any nonzero status. */
function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}${result.stdout}`);
  return result.stdout ?? "";
}

/** A temporary repository with one seed commit, so the tool always has a HEAD to commit on top of. */
function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "grace5-commit-"));
  TEMP_DIRS.push(dir);
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "test@example.invalid");
  git(dir, "config", "user.name", "Test");
  writeFileSync(join(dir, "seed.txt"), "seed\n");
  git(dir, "add", "--", "seed.txt");
  git(dir, "commit", "-q", "-m", "seed");
  return dir;
}

interface Result {
  readonly status: number | null;
  readonly out: string;
  readonly err: string;
}

/** Runs the tool the way a user does, as a subprocess with the repository as its working directory. */
function run(cwd: string, args: readonly string[]): Result {
  const result = spawnSync(process.execPath, [TOOL, ...args], { cwd, encoding: "utf8", windowsHide: true });
  return { status: result.status, out: result.stdout ?? "", err: result.stderr ?? "" };
}

const head = (cwd: string): string => git(cwd, "rev-parse", "HEAD").trim();

/** The parsed `Change` trailer of a revision, empty when it carries none. */
const trailerOf = (cwd: string, revision = "HEAD"): string =>
  git(cwd, "show", "-s", "--pretty=format:%(trailers:key=Change,valueonly)", revision).trim();

/** The changed-path list of a revision, forward-slash normalised, empty lines removed. */
const namesOf = (cwd: string, revision = "HEAD"): string[] =>
  git(cwd, "show", "--pretty=format:", "--name-only", revision)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

test(
  "a product commit with one file carries the exact Change trailer and path and exits 0",
  () => {
    const repo = tempRepo();
    writeFileSync(join(repo, "product.txt"), "one\n");
    const result = run(repo, ["--change", "C-0013", "--message", "add the product file", "--", "product.txt"]);
    expect(result.status).toBe(0);
    expect(result.out).toMatch(/^committed: [0-9a-f]{7,40}$/m);
    expect(result.out).toContain("trailer: Change: C-0013");
    expect(result.out).toContain("paths: 1");
    expect(trailerOf(repo)).toBe("C-0013");
    expect(namesOf(repo)).toEqual(["product.txt"]);
    expect(git(repo, "log", "-1", "--pretty=%s").trim()).toBe("add the product file");
  },
  TIMEOUT,
);

test(
  "one commit can carry a product file and a nested record-path file, and the path set matches",
  () => {
    const repo = tempRepo();
    writeFileSync(join(repo, "product.txt"), "one\n");
    const record = join(repo, ".grace5", "changes", "C-0013-demo", "records", "run-1.xml");
    mkdirSync(join(repo, ".grace5", "changes", "C-0013-demo", "records"), { recursive: true });
    writeFileSync(record, "<run/>\n");
    const result = run(repo, [
      "--change",
      "C-0013",
      "--message",
      "product and record",
      "--",
      "product.txt",
      ".grace5/changes/C-0013-demo/records/run-1.xml",
    ]);
    expect(result.status).toBe(0);
    expect(result.out).toContain("trailer: Change: C-0013");
    expect(result.out).toContain("paths: 2");
    expect(trailerOf(repo)).toBe("C-0013");
    expect(namesOf(repo).sort()).toEqual([".grace5/changes/C-0013-demo/records/run-1.xml", "product.txt"]);
  },
  TIMEOUT,
);

test(
  "a foreign dirty file outside the supplied paths remains uncommitted",
  () => {
    const repo = tempRepo();
    writeFileSync(join(repo, "foreign.txt"), "foreign\n");
    git(repo, "add", "--", "foreign.txt"); // foreign work already staged
    writeFileSync(join(repo, "owned.txt"), "owned\n"); // foreign work untracked
    writeFileSync(join(repo, "product.txt"), "product\n");
    const result = run(repo, ["--change", "C-0013", "--message", "product only", "--", "product.txt"]);
    expect(result.status).toBe(0);
    expect(namesOf(repo)).toEqual(["product.txt"]);
    const status = git(repo, "status", "--porcelain", "--untracked-files=all");
    expect(status).toContain("foreign.txt");
    expect(status).toContain("owned.txt");
  },
  TIMEOUT,
);

test(
  "an empty selection is refused and HEAD does not move",
  () => {
    const repo = tempRepo();
    const before = head(repo);
    const result = run(repo, ["--change", "C-0013", "--message", "nothing to commit"]);
    expect(result.status).toBe(1);
    expect(result.err).toContain("empty selection");
    expect(head(repo)).toBe(before);
  },
  TIMEOUT,
);

test(
  "a path with no modified content is refused and HEAD does not move",
  () => {
    const repo = tempRepo();
    writeFileSync(join(repo, "unchanged.txt"), "same\n");
    git(repo, "add", "--", "unchanged.txt");
    git(repo, "commit", "-q", "-m", "track unchanged");
    const before = head(repo);
    const result = run(repo, ["--change", "C-0013", "--message", "no change", "--", "unchanged.txt"]);
    expect(result.status).toBe(1);
    expect(result.err).toContain("no change");
    expect(head(repo)).toBe(before);
  },
  TIMEOUT,
);

test(
  "a commit-msg hook that strips the Change line makes the read-back fail (exit 1) without hiding the commit",
  () => {
    const repo = tempRepo();
    mkdirSync(join(repo, ".git", "hooks"), { recursive: true });
    writeFileSync(
      join(repo, ".git", "hooks", "commit-msg"),
      "#!/bin/sh\ngrep -v '^Change:' \"$1\" > \"$1.tmp\"\nmv \"$1.tmp\" \"$1\"\n",
    );
    writeFileSync(join(repo, "product.txt"), "one\n");
    const before = head(repo);
    const result = run(repo, ["--change", "C-0013", "--message", "stripped", "--", "product.txt"]);
    expect(result.status).toBe(1);
    expect(result.err).toContain("Change");
    // the failed commit is neither amended nor hidden: HEAD advanced and the trailer is absent
    expect(head(repo)).not.toBe(before);
    expect(trailerOf(repo)).toBe("");
    expect(namesOf(repo)).toEqual(["product.txt"]);
  },
  TIMEOUT,
);

test(
  "--help prints usage and exits 0",
  () => {
    const result = spawnSync(process.execPath, [TOOL, "--help"], { encoding: "utf8", windowsHide: true });
    expect(result.stdout ?? "").toContain("usage: bun src/tools/change-commit.ts");
    expect(result.status).toBe(0);
  },
  TIMEOUT,
);

test(
  "a second commit does not change the first commit's hash",
  () => {
    const repo = tempRepo();
    writeFileSync(join(repo, "first.txt"), "first\n");
    expect(run(repo, ["--change", "C-0013", "--message", "first", "--", "first.txt"]).status).toBe(0);
    const first = head(repo);
    writeFileSync(join(repo, "second.txt"), "second\n");
    expect(run(repo, ["--change", "C-0013", "--message", "second", "--", "second.txt"]).status).toBe(0);
    expect(head(repo)).not.toBe(first);
    expect(git(repo, "rev-parse", "HEAD~1").trim()).toBe(first);
    expect(git(repo, "rev-parse", first).trim()).toBe(first);
  },
  TIMEOUT,
);

test(
  "a red test-first commit is allowed: the routine verifies the trailer, not the test result",
  () => {
    const repo = tempRepo();
    writeFileSync(
      join(repo, "product.test.ts"),
      "import { expect, test } from \"bun:test\";\ntest(\"pending\", () => { expect(1).toBe(2); });\n",
    );
    const result = run(repo, ["--change", "C-0013", "--message", "red test first", "--", "product.test.ts"]);
    expect(result.status).toBe(0);
    expect(trailerOf(repo)).toBe("C-0013");
    expect(namesOf(repo)).toEqual(["product.test.ts"]);
  },
  TIMEOUT,
);

test(
  "malformed arguments exit 2",
  () => {
    const repo = tempRepo();
    const cases: readonly (readonly string[])[] = [
      ["--message", "x", "--", "seed.txt"], // no change id
      ["--change", "bogus", "--message", "x", "--", "seed.txt"], // invalid change id
      ["--change", "C-0013", "--message", "   ", "--", "seed.txt"], // empty message
      ["--change", "C-0013", "--message"], // --message without a value
      ["--change", "C-0013", "--message", "x", "--unknown"], // unknown argument
    ];
    for (const args of cases) {
      const result = run(repo, args);
      expect(result.status).toBe(2);
      expect(result.err).toContain("usage: bun src/tools/change-commit.ts");
    }
  },
  TIMEOUT,
);
