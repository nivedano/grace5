# M2 measurement definitions (proposal)

This is a proposal for the control center's METHOD.md (M1) to adopt; M2 is not defined here and is defined only when that file adopts it, before any pilot exposure and before any comparison. It covers what a GRACE 5 pilot needs beyond M1 (consensus section 7) from records alone, and names each gap. M1's planned additions already reserve M2 for a GRACE 4 scenario-evidence metric, so adoption must merge the two or renumber one.

The unit of exposure stays the change: a `C-NNNN` bundle with a `contract.xml`; closed means `close.xml` exists. A reader finds a bundle at `.grace5/changes/<id>/` while it is open and at `.grace5/changes/closed/<id>/` once `grace5 close` has moved it, and reads both locations; a bundle with `close.xml` that was not moved is closed all the same.

## 1. What M2 adds to M1

| Metric | Definition | Unit | Source |
|---|---|---|---|
| Owner active time per gate | Owner time reading and answering at one gate: approval, manual observation, finding disposal | minutes | human-recorded |
| Owner waiting time per gate | Time from the agent's hand-over to the owner's reply | minutes | human-recorded |
| Time to first reviewable result | Start run `started` to `ended` of the first completed clean run covering every required check | minutes | `run` |
| Time to accepted usable slice | Start run `started` to `close` date, or to an earlier recorded owner acceptance | minutes | `run`, `close`; acceptance human-recorded |
| Total agent cost | Agent tokens and money for the change, all roles | tokens, currency | harness usage logs; no record carries it |
| Artifact-repair time | Active time repairing GRACE 5 artifacts or process, not product | minutes | human-recorded |
| Post-acceptance rework | Commits with the `Change: <id>` trailer after the close date, and the time they took | commits, minutes | git; time human-recorded |
| Escaped-defect severity | Owner-assigned severity of a defect found after close | owner scale | human-recorded |
| Unfinished and cancelled | Changes with a contract and no `close.xml`, kept in every denominator, with the reason | changes | `contract`, `close`; reason human-recorded |
| Exposure by phase and version | Changes and days per phase and exact version | changes, days | `kernel` of `run` and `close`; install ledger otherwise |
| Distinct incidents | A series of non-passed results of one check and one definition hash, ended by a pass; results after the first are repeated diagnostics, counted apart | incidents, diagnostics | `run` |
| Isolation-failure events | A write outside `Affected` or into `Protected`, adopted pre-existing work, or two active changes in one worktree | events | human-recorded |
| Contract size and check count | As reported | words, checks | `brief` |

## 2. Record sources

| Record | Fields read |
|---|---|
| `contract.xml` | `id`, `revision`, `Criterion/@checks`, check ids and kinds, `Decision/@id` |
| `brief-<rev>.html` | `meta` elements `grace5:date`, `grace5:writer`, `grace5:basis`, `grace5:words`, `grace5:target-words`, `grace5:checks`, `grace5:target-checks`; data attributes `data-check`, `data-kind`, `data-required`, `data-decision`, `data-finding`; the prose is not read |
| `approval-<rev>.xml` | `date`, `decision`, `executes`, `brief-sha256`, `Bound/@check`, `@definition-sha256` |
| `run-<n>.xml` | `n`, `started`, `ended`, `status`, `start`, `dirty`, `candidate`, `kernel`, `Preexisting`; per `Result`: `check`, `kind`, `required`, `definition-sha256`, `verdict`, `claim`, `elapsed-ms`, and `Trace/@origin`, `@origin-source`, `@run-echo` |
| `review-<n>.xml` | `date`, `independence`, `status`, `Finding/@id`, `@severity`, `@status`, `Adequacy/@check`, `@discriminates` |
| `close.xml` | `date`, `kernel`, `candidate`, `review`, `Satisfied/@check`, `@run`, `@claim` |

`change` and `revision` join the records (`grace5:change` and `grace5:revision` on the brief). Gaps: `grace5:date` on brief and `date` on approval and review are a day, so waiting per gate cannot come from records; only `run` and `close` carry a version, so prepare and review exposure is attributed by date; `contract.xml` has no date, so draft time comes from git; no record holds agent cost, a cancellation or an isolation-failure category.

## 3. Brief metrics

| Metric | Definition | Source |
|---|---|---|
| Owner time and round trips | Minutes from first contract draft to approval; count of approval records and rejections | human-recorded; `approval` `decision`; git |
| Class `b` defects by first channel | M1 classification, with the owner and later channels reported on their own | M1 classifier; `review` |
| Fidelity check | Sampled briefs: the owner compares listed decisions with memory; coverage of contract `Decision/@id` by brief `data-decision`, and of check ids by `data-check` | human-recorded; `contract`, `brief` |
| Brief length against layout | `grace5:words` and `grace5:checks` of the brief against `grace5:target-words` and `grace5:target-checks` | `brief` |

Removal criterion, owner-reviewed: the owner reports that the brief adds no information over the contract at the sizes the pilot produces, and the fidelity check finds no decision the owner would have missed.

## 4. Trace-check metrics

| Metric | Definition | Source |
|---|---|---|
| Criteria with fresh automated or trace evidence | Per repository, the share of criteria whose declared checks include a passed automated or trace result on the closing candidate, not only a manual one; a sample reviewed for whether the check distinguishes the intended failure | `contract`, `run`, `review` |
| Trace checks authored | Count, with those beyond the required demonstration counted as voluntary | `contract` |
| False failure and maintenance | Failed trace results the owner judges false, and changes of a trace check's `definition-sha256` between revisions | human-recorded; `run`, `approval` |
| Time or cost saved | Against the manual observation replaced | human-recorded; `run` |
| Evidence claims | Count by `claim` and `Trace/@origin`, descriptive | `run` |

Escaped defects and rework (section 1) are the outcomes. A passed check is never counted as proof (consensus K-6). First-detection shares, the device channel included, are descriptive and are compared only across consistently collected M2 exposures. S-001's device share is context, never a comparator.

Removal criterion, owner-reviewed: no voluntary use of trace checks beyond the required demonstration, or a maintenance and false-failure burden the owner judges unacceptable against the time they save.

## 5. Human-recorded items

Owner active time, waiting time, approval fidelity, escaped-defect severity, cancellation reasons, isolation-failure events and the owner's impression note stay human-recorded. The proposal puts one owner-written entry per change in the control center's state, keyed by the change id, not in the governed repository, whose bundle admits only the contract, `notes.md` and records. The note covers the owner's judgement of the brief and the trace checks against their removal criteria.

## 6. Comparison rules

- Snapshots under different method versions are not compared; M1's version rule applies, so S-001 is recomputed or the metric is declined, and M1 snapshots cannot supply the metrics above.
- No causality is claimed from the baseline (consensus C-6): the pilot yields feasibility evidence, not a powered superiority trial.
- Every exposure is attributed to an exact version, and projects are reported first, as in M1.
