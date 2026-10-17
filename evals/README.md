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
