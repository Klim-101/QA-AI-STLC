---
name: qa-metrics
description: >-
  Use when the operator asks how the agent layer's own run went, not how the tests did ("how did
  the agent run go", "how many retries did we use", "did we stay within the parallelism budget",
  "how much time did running spokes in parallel save", "how long did the spokes take", "how many
  tokens or how much money did that run cost"). Never use for test status, results or traceability
  (`qa-report`), to run tests (`qa run`), or to change a budget. Does not fire on its own when a
  run of spokes finishes, only on an explicit request.
triggers:
  - 'how did the agent run go'
  - 'how many retries did we use in that run'
  - 'did we stay within the parallelism budget'
  - 'how much time did running the spokes in parallel save'
  - 'how many tokens did that run use'
nonTriggers:
  - "what's the status of the last test run"
  - 'show me the traceability matrix'
  - 'run the login spec'
  - 'raise the parallelism to 8'
---

# `qa-metrics` — how a run of the agent layer was carried out

Fires on an explicit question about how the spokes of a run were dispatched and how long they took:
counts, retries against the budget, time, concurrency. It is about the agent layer, not about the
application under test: whether the tests passed is `qa-report`'s question.

## What this skill does

1. Call `qa.run_metrics`. Pass `runId` when the operator names a run (the id the hub gave
   `qa.spoke_record_input`); omit it for the run with the newest spoke records.
2. Give back `markdown` as it is. The engine rendered it from the same fields the tool returns, with
   the milliseconds converted to seconds and every figure formatted once. Do not retype the figures
   in your own words, round them again, add them up or turn them into a rate.
3. For a narrower question ("how many retries?"), answer from the one field that holds it and name
   it (`retries.used`, `concurrency.peak`, `timing.overlapSavingMs`). A figure the fields do not
   contain is not answered with an estimate: say that the metrics do not hold it.
4. Say what a flagged field means, and name the configuration key it is set against, only when the
   metrics themselves flag it. Changing a budget is the operator's edit of `.qa/config.yaml`; this
   skill never makes it.
   - `concurrency.isWithinBudget` false: more attempts ran at once than `agents.parallelism` allows.
   - `retries.tasksOverBudget` above zero: a task has more attempts than `agents.retries` gives; the
     engine refuses that, so the records were written outside it.
   - `timing.timedOutAttempts` above zero: attempts were dispatched, never answered, and are older
     than `agents.spokeTimeoutSeconds`.
5. `timing.overlapSavingMs` is what running attempts together saved _within this run_ (the time the
   attempts add up to, less the time at least one was running). It is not a comparison with a
   sequential run of the same work; that comparison is a separate piece of work. Say so when the
   operator asks "was parallel faster".
6. Asked about tokens, cost or money: say that the engine does not measure them. It reads no host
   transcript, so it has no true figure; the host's own usage display is where they are. Offer what
   it does hold (attempts, retries, time). Never give a number for them.
7. `RUN_METRICS_NO_SPOKES`: nothing was dispatched through the hub's recording (`qa.spoke_record_input`),
   so there is nothing to measure. Say that, and do not guess a run. Any other `QaError` is relayed
   with its own message and `remediation`.

## What this skill does not do

- It does not run tests or spokes, approve gates or change configuration.
- It does not report test results or traceability: that is `qa-report`.
- It does not fire on its own when a run of spokes ends.
- It does not invent a figure, a trend or a recommendation the metrics do not contain.
