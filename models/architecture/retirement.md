# Retirement checklist

This list names the GRACE 4 mechanisms and skills that do not migrate to GRACE 5 (consensus G-1 to G-13) and checks each against the GRACE 5 surface in `method.md` and the schemas in `schemas/`. A box is checked only when, after reading both, the surface contains nothing of the kind; an unchecked box carries its reason.

## Mechanisms

| Id | What goes | Replaced in GRACE 5 by | Verified absent |
|---|---|---|---|
| G-1 | Authored graph documents (`GD-*`, `<Summary>` prose, `DF-*`) and the routing indexes | Nothing. Ordinary search and the project's own documents; a module index is deferred (consensus P-1) | [x] |
| G-2 | The file-local markup grammar, every `markup.*` and `analysis.*` lint code, the language adapters and the analysis cache | Nothing. Log markers remain only as plain substrings in Trace `Expect` and `Forbid`; nothing lints them | [x] |
| G-3 | `MustContain`, `MustNotContain`, `MustExist`, `MustVerify`, the text-anchor baselines and the green-at-approval baseline | Starting-state observations of the automated checks, failures included (`run --start`). Trace markers match the log a check's command produces at run time, never project source text | [x] |
| G-4 | `DurableScope` with graph, verification and context anchors, and `scope.durable-overlap` | Nothing. `Affected` names paths, project-native names and protected paths only | [x] |
| G-5 | In-process parallel-safe mode, `--parallel-preflight` and overlap blockers | One change per worktree; overlap information is deferred behind an admission test | [x] |
| G-6 | The committed-scope history engine: trailer ownership reconstruction, near and far labels, widening chronology, `scope.*` codes, metadata-only commits | The `Change: <id>` trailer as plain attribution, the recorded start revision, and review of the complete diff. No reconstruction | [x] |
| G-7 | The five assertion modes and the nested lifecycle commands | Five flat commands: `init`, `check`, `run`, `status`, `close`. `run` has start, targeted and final forms over the same check definitions; no form changes what is asserted | [x] |
| G-8 | The required context quintet | Nothing. `grace5 init` writes a small entry point linking the project's existing documents (`commands.md`) | [x] |
| G-9 | The unique-id-as-tag-name XML convention and its custom grammar | Conventional XML with attribute ids (`id`, `ref`, `check`) and one XSD per artifact | [x] |
| G-10 | The four approval states, the half-approval error, the draft-only lint mode, the re-approval window rules and the mandatory second owner statement | `approval-<rev>.xml` with decision `approved` or `rejected` and an optional `executes` flag in the same statement | [x] |
| G-11 | Any migration engine, GRACE 3 or 4 parser, forwarding alias or compatibility layer | Nothing. Old archives stay readable in the old tooling | [x] |
| G-12 | Verbatim copying of any file from the old repository | Re-implementation from an independent specification | [x] Checked by the independent review of C-0001-kernel against the old repository's source and skills (rule verdict in its review record) |

## Skills

For a retired skill, absent means the surface has no skill of that name or purpose. For a merged or rewritten skill, it means no separate skill of the old name exists and the retained responsibility sits in the named surface item.

| Skill | Disposition | Where the retained responsibility lives | Verified absent |
|---|---|---|---|
| grace-init | Retire | `grace5 init` (detect existing rules and documents, never overwrite) | [x] |
| grace-spec | Merge into prepare | Prepare skill; Problem, Change, Constraints, NonGoals, Acceptance and Decisions of `contract.xml` | [x] |
| grace-plan | Merge into prepare | Prepare skill; Checks and `Affected` (with `Protected`) of `contract.xml`; dependencies and slices in `notes.md` | [x] |
| grace-brief | Rewrite as the brief step that closes prepare | Prepare skill; `brief-<rev>.html` and `approval-<rev>.xml`; no state machine | [x] |
| grace-execute | Rewrite as execute | Execute skill with `grace5 run` | [x] |
| grace-refactor | Retire | Prepare and execute skills, as an ordinary change | [x] |
| grace-setup-subagents | Retire | Harness capabilities; the brief writer and the reviewer receive a bounded task and the contract | [x] |
| grace-fix | Retire | Prepare and execute skills; a check that starts red is recorded by `run --start` | [x] |
| grace-refresh | Retire | Nowhere; there is no hand-maintained corpus to synchronize | [x] |
| grace-status | Retire | `grace5 status` | [x] |
| grace-ask | Retire | Nowhere in GRACE 5; native search and the project's documentation | [x] |
| grace-cli | Retire | `--help` of the five commands and the generated `cli-reference.md` | [x] |
| grace-explainer | Retire | The method document, `method.md` | [x] |
| grace-verification | Merge into prepare and review | Prepare skill (choose decisive checks, trace included); review skill (`Adequacy` per check); the wire-boundary technique in `method.md` | [x] |
| grace-reviewer | Rewrite as review | Review skill and `review-<n>.xml` | [x] |
| grace-migrate | Retire without replacement | Nowhere; `method.md` lists no migration | [x] |

To re-check, read the surface table in `method.md` and the schemas in `schemas/` and confirm that no row above names something they contain.
