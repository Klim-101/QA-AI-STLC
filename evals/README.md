# Agent-layer eval set

Fixed scenarios on the demo app, and the metrics that say how a run of the agent layer did. It makes
no model call: it scores what the engine recorded.

```sh
npm run eval                                   # the scripted baseline, scored
npm run eval -- --project <dir>                # a project a real agent worked in, scored the same way
npm run eval -- --scenario <id or path> --out <dir>
```

The report is written to `.eval/reports/<scenario>.json` and `.md` (both ignored by git) and printed.

## What a scenario holds

`evals/scenarios/<id>.json` (`EvalScenarioSchema`) lists the catalogued bugs of
`examples/demo-app/bugs.json` the run is expected to find. Each has one or more signals, and any one
counts:

- `failed-case`: the latest recorded result of that case failed. It fits a case written for the bug,
  as the baseline's are.
- `defect-title`: a registered defect draft whose title matches the pattern. It fits a run whose cases
  an agent named itself.

## What is measured

| Metric                                                                                             | Read from                                     |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Bugs detected, and which                                                                           | run results, defect drafts                    |
| Valid spoke responses: attempts answered `ok` over all attempts, errors, unanswered, tasks retried | the spoke I/O store (`runs/<run-id>/spokes/`) |
| Selector stability: mean stability score, fragile primary locators                                 | `selectors/registry.json`                     |
| Duration: first spoke dispatch to last answer, and per spoke                                       | spoke record timestamps                       |

A rate with nothing to divide by is `n/a`, not 0. Token use and cost are listed as not measured: the
engine reads no host transcript, so it has no true figure for them.

## The baseline

`scripts/lib/eval-baseline.mjs` makes the engine calls a hub and its spokes make (spoke records, an
exploration, five cases registered by parallel test-design spokes, a run, a triage) with fixed code in
place of a model. It targets BUG-001, 002, 004 and 007 and leaves BUG-008, so it scores 4 of 5: the
number a real agent has to beat, and the same report format P4-08 compares sequential and parallel
runs in.

## Sequential and parallel

```sh
npm run eval -- --compare                # the baseline with 1 spoke at a time, then with 4
npm run eval -- --parallelism 2          # one run, at most 2 spokes at once
```

`--compare` runs the same scripted baseline twice against the demo app, once with `agents.parallelism`
1 (sequential) and once with the number given (4 by default), scores both and writes
`.eval/reports/<scenario>-comparison.{json,md}`: bugs found, valid responses, attempts, retries, the
time (first dispatch to last answer, the attempts added up, the time at least one was running, what
overlap saved) and the most spokes running at once.

A run on the maintainer's machine (2026-10-18, demo app, scenario `baseline-demo-app`):

| Mode       | `agents.parallelism` | Bugs found | Valid responses | Attempts | Retries | Span   | Attempts added up | Active | Saved by overlap | Peak at once |
| ---------- | -------------------- | ---------- | --------------- | -------- | ------- | ------ | ----------------- | ------ | ---------------- | ------------ |
| sequential | 1                    | 4 of 5     | 100.0%          | 7        | 0       | 40.8 s | 7.9 s             | 7.9 s  | 0.0 s            | 1            |
| parallel   | 4                    | 4 of 5     | 100.0%          | 7        | 0       | 35.4 s | 9.4 s             | 7.3 s  | 2.1 s            | 4            |

**Quality is the same in both modes**: the same bugs, the same valid responses, no retries. The
engine is safe to dispatch in parallel (locks on the shared artifacts, P4-04), and that holds here.

**What the table does not show is what parallel is for.** The spokes of the baseline are engine
calls, not model calls, so the time of a spoke is milliseconds of engine work and most of the span is
the Playwright run, which does not depend on the mode. A model takes seconds to minutes per spoke, and
that is where running spokes together saves time. That, and the cost, can only be measured in a host
with an agent, and the engine has no figure for cost at all (it reads no host transcript). So:

- Sequential stays the default in every host; parallel stays opt-in (`agents.parallelism` above 1 on
  Claude Code). Nothing here argues for changing that, and nothing against it.
- The comparison that decides a default (time and cost with an agent) is a run in a host, scored by
  this same scorer with `--project`. It belongs with the per-host benchmark (P5-05, P7-04).

## Running a scenario with a real agent

`evals/scenarios/<id>.requirements.md` is the one input every host gets for a scenario, so two hosts are
scored on the same work. Register it as the scope (`qa scope --from file --path <that file>`, or the
agent's `qa.scope`), let the agent explore, design, execute and file defects, then score the project:
`npm run eval -- --project <dir>`.
