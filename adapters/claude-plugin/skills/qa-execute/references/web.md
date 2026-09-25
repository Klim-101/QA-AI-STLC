# Executing an `e2e` case

A `qa.browser_open` session with `executionMode: true` (ADR-0009): safe mode's non-GET block is
relaxed so a real form submission can go through, but the domain allowlist still applies
unconditionally. Never set `executionMode` outside this skill — exploration and pick mode never
need it.

## Finding a target without a static locator

Interactive execution does not require a registry entry to already exist. After
`qa.browser_navigate`, call `qa.browser_snapshot` and read its `accessibilityTree` evidence — the
normalized page snapshot (development plan section 6.3 step 3) — to find the target the way a
person reading the screen would: by role and visible name, not by inventing a CSS selector. Prefer
a role/name-based Playwright selector (`role=button[name="Log in"]`) over a structural one; it
survives markup changes the same way a person's reading of the page does.

## Promoting the element before it disappears

Call `qa.registry_execute_register` with the selector, its role (`kind`) and accessible `name`
**before** the action that uses it, whenever that action navigates away (a form submit, a link) or
otherwise removes the element from the page. The tool re-verifies the selector resolves to exactly
one element on the _current_ page — calling it after navigation throws `EXECUTE_SELECTOR_NOT_UNIQUE`
or finds the wrong element, not the one just used.

An element already registered from a prior exploration or pick-mode session does not need
re-registering; `qa.registry_execute_register` only adds value for a genuinely ad hoc find. Check
`.qa/selectors/registry.json` (read directly, no MCP query tool for it) before assuming a target is
new — the same convention `qa-design-cases` already follows.

## Driving the case

Follow the case's `steps` in order with `qa.browser_click` / `qa.browser_fill` / `qa.browser_navigate`.
Each call registers its own evidence automatically — collect every evidence id as you go, you will
need the full list for `qa.case_result_register`.

## Closing out

Call `qa.browser_close` when the case's steps are done, whether it passed or failed — an open
session left idle is closed automatically, but do not rely on that.
