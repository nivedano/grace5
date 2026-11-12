# The brief

The brief is the owner's approval surface: the owner reads it instead of the contract. It is one self-contained HTML page, `records/brief-<rev>.html`, written to be read comfortably by a person with limited attention. It is the only record that is not XML and has no XSD, by the owner's ruling of 2026-11-12: the brief informs the owner and is never executed. It is a measured intervention with a removal criterion (`rationale-ledger.md` L-04).

## Who writes it

An independent subagent that never saw the authoring conversation receives the contract, the method documents and read access to the repository (to check cited paths), and nothing of the conversation. It fills `templates/brief.html` and records `writer` as `independent`. In a harness without subagents the author writes it and the page says so (`writer` is `self`). The writer also returns mechanical findings to the author: a criterion its check cannot plausibly serve, an undefined term, a contradiction, a boundary that does not cover the Change, a cited path that does not exist. The author resolves each one, the brief is brought up to the corrected contract, and only then does the owner read it. A brief the owner reads has no open finding.

## Layout and minimum content

The page keeps the template's sections, in order, and its style block unchanged. No script, no external asset.

| Section (`id`) | Must contain |
|---|---|
| `result` | The intended result as theses the owner can agree or disagree with. |
| `boundaries` | Every material boundary; every exclusion, one item per NonGoal, in the list of class `exclusions`; every protected path as its own item with `data-protected` equal to the path. |
| `evidence` | One table row per check with `data-check`, `data-kind` and `data-required`: what a pass shows, and for every manual or trace check, and wherever it matters for an automated one, what it does not show. |
| `decisions` | Every Decision of the contract, as an item with `data-decision` equal to its id, in words the owner will recognise. |
| `risks` | Consequential risks of the contract as written. |
| `burdens` | What the owner must do or rule on: a bench session, a manual procedure, an open limitation. |
| `findings` | The mechanical findings returned, each with `data-finding` of `resolved` or `open`. |
| footer | Contract words and check count against the target with the reason for any excess, and the contract hash. |

The page head carries the binding as `meta` elements named `grace5:change`, `grace5:revision`, `grace5:contract-sha256`, `grace5:date`, `grace5:writer`, `grace5:basis` (`full` or `difference`, the latter with `grace5:previous-revision`), `grace5:words`, `grace5:target-words`, `grace5:checks` and `grace5:target-checks`.

Commands stay in the contract unless their consequence matters to approval. A difference-only brief states in the result, risks and burdens only what changed, and still lists every protected path, exclusion, check and decision of the new revision, marking the changed ones, so the mechanical rules below apply to it unchanged.

## Fidelity

Two checks, neither of which replaces the other.

Mechanical, by `grace5 check` on every brief, reading only the `meta` elements and the `data-` attributes: `grace5:contract-sha256` equals the contract's hash; every check of the contract has exactly one evidence row with the same kind and required flag, and every manual or trace row has a non-empty limitation cell; every Protected path of the contract has an item whose `data-protected` equals it; there are at least as many exclusion items as NonGoals; every Decision id has an item with that `data-decision`; `grace5:words` and `grace5:checks` equal what `check` counts (`commands.md`); no finding is `open`. A brief that fails is reported with the omitted item named. `examples/defective-brief/` holds a brief that omits a protected path, and the check must expose it.

Human, by the owner: the owner compares the listed decisions with their own memory of the conversation. That is the one check no auditor can do, and it is why the decisions are listed in recognisable words. The sampled comparison of brief and owner statements is defined in `m2-proposal.md`.

The mechanical check proves that nothing countable is missing. It does not prove that a boundary is described truthfully; a brief can list a path and misstate what the change does there. That remains with the independent writer and with review.

The approval record carries the SHA-256 of the page the owner read (`authorization.md`), so a brief edited after approval no longer matches.
