---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
---

Interactive case execution capability (P3-14, ADR-0009): the engine can now drive an approved test
case live — a real browser action for `e2e`, a real HTTP call for `api`, a real axe-core scan for
`a11y` — and register what happened as evidence and a run result, before any code is generated.

- `qa.browser_open` gains an opt-in `executionMode` option that allows non-GET requests through a
  session's safe mode (still bounded by the domain allowlist), so a real form submission can be
  proven, not just clicked. Off by default; exploration and pick mode are unaffected.
- New core operations: `runRegisterExecutedElement` promotes an ad hoc, registry-less element pick
  into the selector registry as `source: 'execute'` (a new `SelectorElementSourceSchema` value),
  re-verifying it resolves uniquely first. `runHttpExecute` makes a real HTTP call and registers
  the request/response as evidence (`HttpClient` gains a general-purpose `request()` method
  alongside its existing `get()`). `runBrowserAccessibilityScan` runs a real `axe-core` scan
  against the session's current page and registers the raw result as evidence. `runRegisterCaseResult`
  ties a run's evidence together into a `RunResultSchema` value, with the caller (not the engine)
  supplying the pass/fail verdict.
- New runtime dependency: `axe-core` (MPL-2.0, maintainer-approved, see `NOTICE`).
