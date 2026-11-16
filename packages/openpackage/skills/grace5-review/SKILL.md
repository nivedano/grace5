---
name: grace5-review
description: Use when a GRACE 5 change has final evidence on a clean committed revision and needs its review record, or when a review has to be repeated after fixes. Covers what the reviewer receives, what it judges, and numbered review records.
---

# Review a GRACE 5 change

Before working, read the repository's optional `.grace5/extensions/` files and follow those addressed to your role (`method.md`, Local extensions).

File names below refer to the GRACE 5 method documents: `models/architecture/` in the GRACE 5 repository, elsewhere those shipped with the package. `evidence-records.md` defines the review record and what `grace5 close` reads from it.

## Handing over

The author gives an independent reviewer, a subagent or a person who did not see the authoring conversation, exactly this and nothing of that conversation:

- `contract.xml` of the current revision;
- the complete diff from the start revision to the final revision (`git diff <start> <end>`, both taken from `grace5 status <id>`);
- every rule file the contract cites in a `rule` attribute;
- the receipts `records/run-<n>.xml`, and the logs where they exist;
- the output of `grace5 status <id>` and `grace5 check <id>`.

The author adds no summary, no explanation of intent and no list of what to look at. The rest of this skill addresses the reviewer.

## What to judge

- Behavioural correctness. Read the whole diff against Change, Constraints and each Criterion. Does the code do what the contract says, and nothing the NonGoals exclude?
- Test adequacy. Do the tests added or changed exercise the behaviour, including its failure paths, or do they only run it?
- Adequacy of each check. Write one `Adequacy` statement per required check answering one question: does a pass discriminate the intended behaviour from its failure mode? A receipt claims only what its `claim` says, so read the command, not the verdict.
- For a Trace check, read the capture command itself. Would the same marker sequence appear if the behaviour were broken? Is the origin honest, meaning the command really captures during the run what it reports as live, and takes device and build from the device and not from constants?
- Rules. Give a verdict for each rule the contract cites: `upheld`, `violated` or `not-applicable`, read against the rule file, not against the constraint's paraphrase.
- Boundary. `grace5 status` lists changed files as `outside: <path>` and `protected: <path>`. The kernel blocks only the protected ones; judge each outside write and record a finding for any that is not a test of an affected file or is otherwise unjustified.
- Release discipline. An ordinary change that bumps the version in `package.json`, the README status line or `.grace5/kernel-version`, or registers migration boundaries or versioned table rows, is a blocking finding (`upgrade.md`); preparing migration implementation and tests is allowed.

## Findings

- Each finding has a severity, `blocking` or `non-blocking`, and a status. A new finding is `open`.
- A violated rule and a check that does not discriminate are each also written as a blocking finding.
- `owner-disposed` requires a neutral `OwnerDecision` stating the owner's actual disposition. Never infer it.
- You report. You do not approve, do not close, do not fix the code and do not soften a finding because the checks are green.

## The record

Write `records/review-<n>.xml`, `n` one above the highest existing, to `schemas/review.xsd`. Element order is fixed: `Independence`, then every `Finding`, then every `Adequacy`, then every `Rule`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Review change="C-0007-empty-export" revision="1" contract-sha256="0000000000000000000000000000000000000000000000000000000000000000" n="1" date="2026-11-12" independence="independent" start-revision="0000000000000000000000000000000000000000" end-revision="0000000000000000000000000000000000000000" candidate="0000000000000000000000000000000000000000000000000000000000000000" status="completed">
  <Independence>What the reviewer was given and what they had not seen.</Independence>
  <Finding id="F1" severity="blocking" status="open" path="src/export/writer.ts">
    <Text>What is wrong and where.</Text>
  </Finding>
  <Adequacy check="CK1" discriminates="true">Why a pass separates the behaviour from its failure mode.</Adequacy>
  <Rule rule="docs/design-rules.md#DR-3" verdict="upheld">Why.</Rule>
</Review>
```

- Replace the zeros: `contract-sha256` from `grace5 check`, `start-revision` and `candidate` from `grace5 status`, `end-revision` the commit reviewed. `rule` repeats the contract's `rule` value exactly. `Resolution` and `OwnerDecision` follow `Text` inside a finding when they apply.
- Use `status="incomplete"` when you could not cover the complete diff, and say what was missing in `Independence`.
- Run `grace5 check <id>` to validate the record, and return the findings to the author.

## Self-review

A small change may be reviewed by its author. That is the author's judgement and it is visible: `independence="self"`, and `Independence` states the limitation, namely that the reviewer wrote the change and saw the conversation. Everything above still applies, every `Adequacy` statement included.

## Re-review

After a fix the candidate has changed, and the earlier review is history. Once `grace5-execute` has repeated the final evidence, the new review covers the complete diff from the start revision again, not the fix alone, in a new record with the next `n`. Carry earlier findings forward with their current status and `Resolution`; never edit an earlier record.
