<!-- Generated from the help text of the grace5 CLI by src/tools/cli-reference.ts. Do not edit by hand; run `bun run package`. -->

# CLI reference

This file is generated from the help text the CLI prints and is not edited by hand. Behaviour is stated in `commands.md`.

## grace5

```text
grace5: a kernel for owner-approved, evidence-closed changes

Usage:
  grace5 [--root <dir>] <command> [change] [flags]

Commands:
  init     Create .grace5/ and, with a change id, a change directory with a contract template.
  check    Validate a change: contract, records and approvals. Executes nothing.
  run      Execute checks, or record a manual observation or a skip, and write one receipt.
  status   Report the whole state of a change and its next unresolved obligation, or list every change.
  close    Verify the eight closing steps and write close.xml, or refuse at the first unmet one.
  upgrade  Bring the repository state from its pinned version to this kernel's version, step by step.
  schema   Locate an XSD shipped with this kernel.

Documentation:
  documentation root: models/architecture/
  grace5 schema <name> prints the absolute path of a shipped schema.
  The method document and its topic files and the schemas ship inside the kernel package under
  this directory. The path is relative to the kernel package, not to the repository root.

Global options:
  --root <dir>   The repository root that holds .grace5/. Defaults to the current directory.
  --help, -h     Show this help, or the help of a command (grace5 <command> --help).
  --version      Print the kernel name and version.

The version pin:
  .grace5/kernel-version holds the version the state conforms to; a missing pin where .grace5/
  exists reads as 0.1.0. Every command except status, upgrade, schema, the help and version flags, and
  init on a repository without .grace5/ refuses when the pin differs from this kernel or cannot
  be read as a version:
    refused: repository state is at <pin>, kernel is <version>: run grace5 upgrade
    refused: repository state is at <pin>, kernel is <version>: kernel too old
    refused: repository pin is unreadable: <reason>

The change:
  A change is named by its directory, for example C-0007-empty-export; the bare number C-0007
  is accepted when it names one change. An open change lives under .grace5/changes/; close
  moves a closed one (one with records/close.xml) under .grace5/changes/closed/, and every
  command finds a change in either place. When no change is named, check, run and close
  select the single open change and fail when there is none or more than one. status without
  a change lists the open changes and counts the closed ones (--all lists them too).

Output:
  Plain text, one fact per line. Change paths are relative to the repository root unless specified.

Exit status:
  0  success
  1  a refusal, a defect, or a run in which any executed check did not pass
  2  a usage error
```

## grace5 init

```text
grace5 init: create the GRACE 5 entry point and, optionally, a change

Usage:
  grace5 [--root <dir>] init [change]

Creates .grace5/changes/, .grace5/kernel-version (the version pin, written with this kernel's
version), .grace5/.gitignore (the local ignore file that keeps the run logs out of git; no
project file is written) and .grace5/README.md, a short entry point that links the project
documents and rule files found in the root (README, AGENTS.md, CLAUDE.md, docs/, models/).
With a change id (C-NNNN with an optional lower-case slug) it also creates
.grace5/changes/<change>/, its records/ directory and a contract.xml template. A change id
is unique across open and closed changes: an id that already has a directory under
.grace5/changes/ or .grace5/changes/closed/ is refused.

It overwrites nothing: an existing file or directory is reported and left alone. Where .grace5/
already exists, init is refused like every other command when the pin differs from this kernel.

Output:
  created: <path>    for each file or directory created
  exists: <path>     for each one already present
  refused: <reason>  the change id exists, open or closed, or the pin differs; nothing is written

Exit status:
  0  success
  1  the root is not a directory, the change id exists, or the pin differs from this kernel
  2  a usage error, such as a malformed change id
```

## grace5 check

```text
grace5 check: validate a change, executing nothing

Usage:
  grace5 [--root <dir>] check [change]

Checks, for the selected change:
  1. contract.xml validates against schemas/contract.xsd.
  2. Every id in a Criterion's checks names a check; every environment names an Environment;
     a check that serves no criterion is reported as unused.
  3. Every rule path, without its #fragment, exists in the repository, unless it is
     under Affected: a contract may cite a document it creates or amends.
  4. Protected globs are well formed, and no Path is wholly covered by a Protected.
  5. Every XML record present validates against its schema and names this change.
  6. An approval that carries brief-sha256 is a legacy approval: the brief of the contract's
     current revision carries the current contract hash and passes every mechanical fidelity
     rule; briefs of other revisions are not checked. A new approval without brief-sha256
     requires no brief.
  7. An approved approval has one Bound per check.
  8. A rejected approval carries a non-empty Statement as its reason.

Output:
  contract-sha256: <hash>        SHA-256 of contract.xml with CRLF read as LF
  definition <id>: <hash>        per check, the hash of its canonical definition
  words: <n> (target 600)        whitespace-separated tokens of all element text
  checks: <n> (target 8)         all check elements, optional ones included
  defect: <text>                 per defect; a legacy brief or a record defect starts with its file name

Size is reported, never enforced.

Exit status:
  0  no defect
  1  at least one defect
  2  a usage error
```

## grace5 run

```text
grace5 run: execute checks and write one receipt

Usage:
  grace5 [--root <dir>] run [change]
  grace5 [--root <dir>] run [change] --recover
  grace5 [--root <dir>] run [change] --check <id>...
  grace5 [--root <dir>] run [change] --start [--check <trace id>...]
  grace5 [--root <dir>] run [change] --check <id> --observe <verdict> --build <build>
                                     [--environment <text>] [--reference <ref>] --note <text>
  grace5 [--root <dir>] run [change] --check <id> --from <file>
  grace5 [--root <dir>] run [change] --skip <id>... --note <reason>

The change, when named, comes before the flags.

Forms:
  --recover         Adopt abandoned reservations with valid headers as interrupted receipts.
                    Skip live runs and existing receipts. Report how to rerun checks when a
                    header is missing or invalid. This form does not execute checks.
  (no flags)        Execute every automated and trace check, optional ones included, in
                    document order. Manual checks are not touched.
  --check <id>...   Execute only the named automated or trace checks. One or more ids follow
                    the flag; the flag may be repeated.
  --start           The first run of a change. Records the start revision and the pre-existing
                    dirty source paths, and executes the automated checks, plus any trace check
                    named with --check, to record the starting state, failures included.
                    A second start run is refused. Every other form is refused before a start
                    run exists.
  --observe <verdict>
                    Record a manual observation for the one manual check named with --check.
                    The verdict is passed, failed, blocked or not-attempted.
      --build <build>        The build identity observed. Required. If the check's Environment
                             declares a build, this must satisfy it or the result is refused.
      --environment <text>   Where it was observed. Defaults to the text of the check's
                             Environment; required when the check declares none.
      --reference <ref>      A photo, log or note that supports the observation. Optional.
      --note <text>          What was seen. Required.
  --from <file>     Read the observation fields from a file of name=value lines (observe,
                    build, environment, reference, note); a flag given as well wins.
  --skip <id>... --note <reason>
                    Record the named checks as skipped with the reason.

Executing checks requires a git repository with at least one commit, a start run (except for --start) and an
approval of the current contract revision that authorizes execution. While the current
revision is unapproved, rejected or altered, the checks whose definition the last approval
that authorized execution still binds run, and every other selected check is recorded as
refused: amended in unapproved revision. A closed or malformed change refuses every run.

A command runs through the platform shell (sh -c, or cmd /d /s /c on Windows) in the check's
cwd, with standard output and error captured together into
.grace5/changes/<change>/records/logs/run-<n>/<check>.log. A trace check that names a log
file has that file copied there instead, and its output kept as <check>.output.log.
Exported to the command: GRACE5_RUN_ID, GRACE5_CHANGE, GRACE5_CHECK, GRACE5_SOURCE_REVISION,
GRACE5_CANDIDATE. A capture command reports provenance by printing the line
  grace5-provenance: origin=<live|replay|fixture> run=<GRACE5_RUN_ID> device=<id> build=<id>
where device and build are optional. Exceeding the check's budget (seconds) kills the process
tree and records cancelled. An interrupt (SIGINT, SIGTERM) stops the running command and
writes the receipt with status interrupted.

Output:
  logs: records/logs/run-<n>/              first, relative to the change directory
  run <n>: <check> starting                as processing of each selected check begins
  run <n>: <check> <verdict>[: <reason>]   as resolved, repeated in order after receipt publication
  receipt: <path>                          the receipt written, records/run-<n>.xml
  refused: <reason>                        a refused invocation; no receipt is written

Verdicts: passed, failed, blocked, cancelled, interrupted, not-attempted, skipped, refused.

Exit status:
  0  every executed check passed; or an observation or a skip was recorded
  1  the invocation was refused, the run was interrupted, any executed check did not pass,
     or an observation was refused
  2  a usage error
```

## grace5 status

```text
grace5 status: report the state of a change, changing nothing

Usage:
  grace5 [--root <dir>] status [change]
  grace5 [--root <dir>] status --all

The first line, in both forms, names the kernel and the pinned version of the state:
  kernel: <version>, state: <pin>                        the two are equal
  kernel: <version>, state: <pin>, run grace5 upgrade    the state is behind this kernel
  kernel: <version>, state: <pin>, kernel too old        the state is ahead of this kernel
  kernel: <version>, state: none                         there is no .grace5/
  kernel: <version>, state: unreadable (<reason>)        the pin is not a version

With a change, one fact per line:
  change: <id>
  malformed: <first error>            only when the change fails validation
  revision: <n>                       the contract revision
  authorization: <state>              unapproved, approved, rejected
                                      or altered after approval
  start: <revision>                   the start revision, or none
  candidate: <hash> (clean|dirty)     the candidate of HEAD and the state of the working tree
  outside: <path>                     per changed file outside the contract's Path elements
  protected: <path>                   per changed file inside a Protected path
  check <id>: <verdict>, counts
  check <id>: <verdict>, does not count: <reason>
                                      per check, its current result and whether it would
                                      count at close; "no result" when it has none; followed
                                      by ", recorded with <kernel>" when the receipt was
                                      written by another kernel than this one
  review: <current review>            its status, candidate and open findings, or none
  interrupted: run-<n>                per interrupted run
  closed: <path of close.xml>         only when closed; under .grace5/changes/closed/ once moved
  next: <obligation>                  the first step close would refuse at; "close" when
                                      every step is met

Changed files are the difference from the start revision to HEAD, plus uncommitted work.

Without a change, one line per open change, then one line counting the closed ones:
  <id>: <authorization>, next: <obligation>
  <id>: malformed: <first error>      in either location; a directory under closed/ without
                                      records/close.xml is malformed
  closed changes: <n>                 every change whose records/close.xml exists, moved or not

  --all   also lists every closed change, one line each before the count:
  <id>: closed

Exit status:
  0  the state was reported, whatever it is
  1  the named change does not exist
  2  a usage error
```

## grace5 close

```text
grace5 close: verify the closing steps and write close.xml

Usage:
  grace5 [--root <dir>] close [change]

Checks these in order and refuses at the first unmet one, naming it:
  1. check reports no defect in the contract or in an approval, run or review record; then
     the contract's hash equals the hash in the current revision's approval, and that
     approval is approved, authorizes execution and binds every check; then, for a legacy
     approval, check reports no defect in the current revision's brief.
  2. A legacy approval that carries brief-sha256 has a brief for the current revision with
     the same contract hash and its own hash equal to brief-sha256; a new approval without
     the attribute has no brief obligation.
  3. A start run exists and its source revision can be resolved in the repository.
  4. The working tree has no dirty source path.
  5. The complete source diff from the start revision touches no protected path.
  6. Every required automated and trace check: the current result is passed, clean, on the
     final candidate, with the current definition hash.
  7. Every required manual check: the current result is a passed observation, recorded clean
     on the final candidate with the current definition hash, a build and an environment.
  8. The current review is completed; carries the current contract hash; covers the complete
     diff, its start-revision being the start run's revision and its end-revision a commit
     that carries the final candidate; has no blocking finding that is open or that is
     owner-disposed without the owner's recorded decision; has an Adequacy with
     discriminates="true" for every required check; and has no Rule with verdict violated.

Then it writes records/close.xml naming the run that satisfied each check, and as a ninth
step, never a closing condition, moves the whole change directory, untracked logs included,
to .grace5/changes/closed/<change>/. A closed change refuses further runs and a second close.

Output:
  closed: <path of close.xml>   .grace5/changes/closed/<change>/records/close.xml once moved
  refused: <obligation>
  not moved: <reason>           the change is closed where it stands; the closed: line says where

Exit status:
  0  close.xml was written
  1  refused
  2  a usage error
```

## grace5 upgrade

```text
grace5 upgrade: bring the repository state to this kernel's version

Usage:
  grace5 [--root <dir>] upgrade
  grace5 [--root <dir>] upgrade --plan

Reads the pin .grace5/kernel-version (a missing pin reads as 0.1.0) and composes the chain of
migration steps from that version to this kernel's version. A migration step is kernel code for
one version boundary whose state layout, local ignore file or skills differ; it is idempotent
and verifies its own result. A boundary without a step is a pin bump. Every step also refreshes
the grace5-* skill directories that already exist under .agents/skills/ or .claude/skills/ from
the packaged skills, and creates no new location.

Open changes may be present. Everything the chain writes is kernel-managed, the state under
.grace5/ and the installed grace5-* skill directories, which no candidate, dirty state or diff
reads, so an upgrade changes no open change's evidence and needs no flag. Before anything is
written, every step declares the change directories it would write: a step that would write
an open change is refused, with no override (close that change with the previous kernel, or
abandon it). Open changes no step touches are listed as open, untouched: and read by the
post-upgrade check like every other change. The kernel writes no project file: a line an
earlier version wrote into the project's .gitignore is left alone.

When the chain contains a step, the kernel also refuses to refresh from a checkout whose
skills/ differs from HEAD: uncommitted skill text is never installed into a
governed repository. A chain of pin bumps reads no skills and is not refused, and a checkout
without .git is not checked.

The chain is printed as a plan, one line per link. With --plan nothing is written. Otherwise the
links are applied in order, the pin is written after each one, and the first failure stops the
upgrade with the pin at the last completed version; running upgrade again resumes from there.
After the chain, every change in both locations is read as check reads it, and the upgrade fails
if any reports a new defect, or a contract or definition hash other than before.

Refuses: outside a git repository; without .grace5/; when the pin cannot be read as a version;
when the pin is ahead of this kernel; when a step would write an open change; when the chain
contains a step and the kernel's own skills/ differs from HEAD. It never
downgrades and takes no target version.

Output:
  up to date: <version>                     the pin equals this kernel's version; nothing to do
  step: <from> -> <to>: <description>       a migration step of the plan
  bump: <from> -> <to>: <reason>            a boundary without a step; only the pin advances
  open, untouched: <id>, <id>               the open changes, which no step writes
  scope: <explanation>                      why upgrade paths cannot violate Protected globs
  refreshed: <path>                         a skill directory refreshed in place
  skills: none installed                    no skill directory exists in either location
  pinned: <version>                         the pin written after a link
  failed: <from> -> <to>: <reason>          a step failed; the pin is at <from>
  failed: post-upgrade check: <id>: <what>  a change reads differently after the chain
  checked: <id>                             a change read unchanged after the chain
  resume: <id>: <guidance>                  retain the contract and start; read status for obligations
  upgraded: <from> -> <to>                  the chain completed and the check passed
  refused: <reason>                         not a git repository, .grace5/ does not exist,
                                            repository pin is unreadable: <reason>,
                                            kernel too old,
                                            open changes touched by step <from> -> <to>: <id>, <id>, or
                                            kernel skills are modified relative to HEAD: <path>

After a successful upgrade, commit the result.

Exit status:
  0  up to date, the plan was printed, or the upgrade completed
  1  refused, a step failed, or the post-upgrade check failed
  2  a usage error
```

## grace5 schema

```text
Usage: grace5 schema <contract|approval|run|review|close|common>

Print the absolute path of the named XSD in the running kernel package.
Works from any directory without a repository or version pin.
```
