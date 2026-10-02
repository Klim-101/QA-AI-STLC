# ADR-0013: Browser toolset parity and compact page views

Status: Accepted
Date: 2026-10-02

## Context

The agent drives the application under test only through the engine's `qa.browser_*` tools (ADR-004, ADR-005). Those tools cover opening a session, navigating, clicking, filling, component-library widgets and taking a snapshot. Real test cases need more than that: pressing a key, hovering, ticking a checkbox, picking from a native `<select>`, waiting for a condition, handling a `confirm` dialog or a link that opens a new tab, uploading a file, and reading the console or failed requests.

General-purpose browser MCP servers already offer most of these actions, and one could be made an optional add-on. That would break three guarantees. Its actions register no evidence, so a result built on them cannot be traced to anything the engine did (ADR-005). It does not apply the session's safe mode or domain allowlist (AGENTS.md 12.4). Its steps carry no `stepId`, so `qa-generate-tests` cannot recover them (ADR-0010). AGENTS.md 2.4 also rules out shipping or requiring a third-party MCP server.

How the agent reads a page is a second problem. `qa.browser_snapshot` returns only the ids of two evidence records, a screenshot and Playwright's raw accessibility tree. To see the page, the agent opens the tree file, which is neither normalized nor capped. It then writes a selector by hand for the next action. That costs many tokens per page and is where invented selectors come from. A screenshot is taken on every snapshot even when nobody looks at it. And nothing lets the agent confirm an expected result except reading the page and saying what it saw, which is the narration ADR-005 exists to rule out.

## Decision

No third-party browser server is added, optional or otherwise. The engine closes the capability gap with tools of its own, and changes how a page is presented to the agent.

1. **Missing actions become engine tools.** Each one registers evidence, takes `stepId`, applies safe mode and the allowlist, and is bounded by the action timeout:
   - key presses, hover, and checkbox or radio state, each verified;
   - native `<select>` support in the existing `qa.browser_select_option`;
   - explicit waits for text, element state or URL;
   - dialogs (dismissed by default, each recorded) and new pages, which a tab tool can list and switch to under the same allowlist;
   - file upload from project-relative paths only, recorded by name, size and hash;
   - read-back of console messages and requests as capped, redacted summaries.
2. **A snapshot is a compact page view.** `qa.browser_snapshot` returns the page's accessibility tree inline: normalized, capped in size, marked as untrusted page data, with a short ref on every actionable node. The full tree is still registered as evidence. A screenshot is taken only when asked for.
3. **Actions accept refs.** Any action tool takes a `ref` from the session's latest snapshot instead of a `selector`. The engine resolves the ref to a role-and-name selector and records that selector in the evidence. A ref from an older snapshot, or one that no longer resolves to exactly one element, fails with `BROWSER_REF_STALE`. Refs live only inside a session; generated tests keep using the locator module (ADR-006).
4. **A snapshot can be a diff.** Given the id of an earlier snapshot of the same session, `qa.browser_snapshot` returns only what changed since then.
5. **Expected results are engine checks.** `qa.browser_expect` checks one expectation in the page (visible, text, value, count, checked, URL), waits for it within the action timeout, and registers the observed value with a pass or fail verdict. Skills check every expected result through it rather than describing the page.

## Consequences

The agent gets the actions a real case needs without giving up the evidence trail, safe mode or the allowlist. Page reads become small and predictable, and an action no longer depends on a selector the agent made up. An expected result now has engine-recorded evidence behind it.

The engine takes on more browser code to maintain, and the toolset grows from 36 to about 45 tools. Each new tool stays narrow and its description says when to use it instead of its neighbour. Tool-selection evals in the skill guidance task check the common mix-ups. Refs add session state that has to be invalidated correctly; checking a ref against the snapshot that produced it is part of the integrity self-review (AGENTS.md 12.7).

Two alternatives were rejected. An optional third-party browser server was rejected for the reasons in the context: no evidence, no safe mode, and it would be an external dependency. A single generic "act" tool with an action parameter was rejected because a narrow tool with its own input schema is easier for a model to choose and for the engine to validate.

Work is tracked as P6-51 to P6-62.
