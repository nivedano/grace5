# Trace provenance

A trace check passes when its markers appear in order in a log. What that pass is worth depends on where the log came from. This file defines how origin and identity are established and recorded, and what the kernel refuses. The demonstration uses `examples/D-trace-boot/`.

## What the kernel knows and what it is told

The kernel observes four things itself: the command it started, the interval during which the command ran, the bytes of the log, and the run it belongs to. Everything else is reported by the capture command, which is a project-owned command named in the approved contract and read by the reviewer. The kernel does not claim to detect a stale log by its content.

`grace5 run` exports to every check command:

| Variable | Value |
|---|---|
| `GRACE5_RUN_ID` | A fresh random id for this run. |
| `GRACE5_CHANGE`, `GRACE5_CHECK` | The change id and the check id. |
| `GRACE5_SOURCE_REVISION`, `GRACE5_CANDIDATE` | The source identity of the run (`source-identity.md`). |

A capture command reports provenance by writing one line into its log:

`grace5-provenance: origin=<live|replay|fixture> run=<GRACE5_RUN_ID> device=<id> build=<id>`

`device` and `build` are optional. Only a line whose `run` equals this run's id counts; a provenance line carried inside an old log names an old run and is ignored. This echo is what ties a provenance statement to the present run rather than to the file it was copied from.

## Receipt fields

The `Trace` element of a result (`schemas/run.xsd`) records:

| Field | Meaning |
|---|---|
| `log`, `log-sha256` (on the result) | Identity of the captured artifact, stored under `records/logs/run-<n>/`. |
| `origin`, `origin-source` | The reported origin; `observed` when a matching provenance line reported it, `absent` when none did. The contract's required origin is never copied here, so `declared` does not occur for origin. |
| `run-echo` | Whether a provenance line echoed this run's id. |
| `capture-started`, `capture-ended` | The interval of the command, measured by the kernel. |
| `device`, `device-source` | Device identity: `observed` when the capture command reported it, `declared` when only the contract's Environment states it, `absent` otherwise. |
| `build`, `build-source` | Build identity, same three sources. |
| `matched`, `expected`, `Missing`, `Forbidden` | How many Expect markers were found in order, the first marker not found, and any Forbid marker present. |

The result also carries the check definition hash and the run carries the candidate, so the receipt names the definition and the inputs it is bound to.

## Claims and refusals

| Check requires | Receipt has | Verdict and claim |
|---|---|---|
| `live` | Echoed line, `origin=live`, identities consistent with the Environment | Sequence checked; a pass claims `marker-sequence-live`. |
| `live` | No echoed line | `refused`: live provenance missing. Markers are not consulted. |
| `live` | Echoed line with `origin=replay` or `fixture` | `refused`: a replay does not satisfy a live check. |
| `live` | Device differs from the Environment's `device`, or the build does not satisfy its `build` | `refused`: identity mismatched. |
| `live`, Environment declares a device or build | The line reports none | `refused`: identity missing. A declared identity is not an observed one. |
| `replay` or `fixture` | Echoed line with that origin | Sequence checked; a pass claims `marker-sequence-replay` or `marker-sequence-fixture`. |
| `replay` or `fixture` | Another origin, or none | `refused`. |
| `any` | Any | Sequence checked; the claim names the origin reported, or `marker-sequence-unattributed` when none was. |

An Environment `build` of `@revision` is satisfied when the observed build identity contains the first eight characters of the run's source revision, or of an ancestor commit that carries the same candidate (`source-identity.md`), so committing a record between flashing and capturing does not demand a reflash. Any other value must equal the observed build.

Markers are matched as plain substrings in order: each Expect is searched after the end of the previous match. `min` (default 1) and `max` (default unbounded) bound how many times a marker occurs from its own match up to the match of the next Expect, or to the end of the log for the last one. A Forbid marker anywhere in the log fails the check. A command that exceeds `budget` is cancelled and the check is `cancelled`. There is no per-marker timing.

## Demonstration: live capture and replay side by side

The firmware example declares an Environment with the bench device and `build="@revision"`, a required live trace check and an optional replay check over a few of the same markers.

Live. The capture script resets the board itself, so the boot it records begins inside the capture interval. It reads the serial output for the budgeted seconds, takes the device id and the application version from the boot banner (the build stamps the version with the abbreviated commit), and prints `grace5-provenance: origin=live run=$GRACE5_RUN_ID device=<banner id> build=<banner version>`. The receipt then records origin, device and build as observed, and the kernel compares them with the Environment. Flashing a different board, or forgetting to flash the candidate, shows up as an identity mismatch and a refusal instead of a pass about the wrong thing.

Replay. The replay script prints a recorded boot log and `grace5-provenance: origin=replay run=$GRACE5_RUN_ID`. Its markers are checked and a pass claims `marker-sequence-replay`. It shows that the marker list still matches a known good log, which is worth having when the list is edited. It says nothing about the candidate on a device, and it cannot satisfy the live check: pointing the live check's command at the replay script produces `origin=replay` and a refusal, and a script that only prints an old log produces no echoed line and a refusal.

What remains outside the kernel: a capture script that prints `origin=live` without capturing anything. The command is approved with the contract and read in review, and the review's adequacy statement for the check is where that is caught.
