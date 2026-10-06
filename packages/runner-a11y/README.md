# @qa-ai-stlc/runner-a11y

Implements the `Runner` interface (`@qa-ai-stlc/core`) for `a11y` test cases. A spec is an ordinary
Playwright Test file: it navigates and calls the generated `scanAccessibility(page, testInfo)` helper
from `tests/qa/a11y-scan.ts`, which the runner writes before the first run.

The helper does not decide anything. The runner derives the axe-core plan from the `a11y` block of
`.qa/config.yaml` (WCAG version, conformance level, best-practice rules, include and exclude
selectors) and passes it to the Playwright process through its environment, so a spec cannot choose a
lighter scan than the project asked for. The helper attaches the raw axe-core result; afterwards the
engine turns each attachment into an `a11y-scan` evidence record — configuration hash, axe-core
version, violations, excepted violations, expired exceptions, `incomplete` results as `uncertain` —
and sets the case's status:

- a violation no active exception covers fails the case, naming the violated rules;
- an `incomplete` result with no violation leaves the case `uncertain`, never `passed`;
- a case that passed without scanning anything is rejected (`RUNNER_A11Y_NO_SCAN`), because nothing
  backs its result.

A status Playwright already reported other than `passed` (`failed`, `blocked`, `skipped`, `partial`)
is kept as it is. Automated results alone do not establish WCAG conformance; the conformance report
lists what still needs a manual check.

Execution and result mapping reuse `@qa-ai-stlc/runner-playwright`.

Part of [QA-AI-STLC](https://github.com/Klim-101/QA-AI-STLC). See the repository root for
license, contributing and security information.
