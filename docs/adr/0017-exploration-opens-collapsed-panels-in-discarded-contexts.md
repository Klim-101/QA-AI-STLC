# ADR-0017: Exploration may open collapsed panels, in discarded contexts

Status: Accepted
Date: 2026-10-15

## Context

The crawl reads what is in the DOM when the page has loaded. A filter inside a collapsed "Search
Details" panel is not in the DOM until the panel opens, so it never reached the registry; the agent
found it during execution with a live snapshot, which is why execution worked while the registry
stayed incomplete. The same page has controls the crawl read but did not register: sortable headers
(a `span` that carries the test id) and status chips (a custom element used as a toggle).

Opening a panel is a click, which ADR-0015 allowed only for navigation-only controls and only in
contexts that are thrown away.

## Decision

`qa explore --expand-collapsed` (MCP `expandCollapsed`) opens the collapsed panels of each page before
the page is read, under the rules ADR-0015 set for probing:

- Each page is analyzed and scored in a browser context of its own, discarded afterwards, with safe
  mode installed on the context so a popup is covered as well.
- The controls clicked are those that say `aria-expanded="false"`, plus the selectors a component
  library profile names (`collapsiblePanelSelectors`), minus links, submit and reset buttons, disabled
  controls, and anything that carries a popup (`role="combobox"`, `aria-haspopup`). The ADR-0015 name
  denylist applies (sign out, delete, and so on).
- Up to three rounds and 20 clicks per page, so a panel inside a panel opens. A click that navigates
  the page away is undone by loading the page again, and ends the expansion.
- Scoring reloads the page, which closes the panels again, so the panels are reopened after every
  reload; a control inside a panel would otherwise score 0. `--verify` honors the flag for the same
  reason.
- The report carries `expandedPanelCount`, as `navigationProbeCount` does for probing.

An element that is not natively interactive but carries the configured test id and looks operable (a
role such as `button` or `columnheader`, a `tabindex`, a custom-element tag or a pointer cursor) is
registered with kind `element`. A bare container with a test id is not. The Kendo UI for Angular
profile registers a grid header cell (`kendo-grid th[role="columnheader"]`) under its title.

## Consequences

The flag is opt-in and slower: every page gets a browser context and a few settle waits. The guarantee
for an exploration session is "performs no action unless probing or expanding was asked for, and then
only in discarded contexts under safe mode".

An application that changes server state through a GET behind a harmlessly named toggle is still
exposed, as with ADR-0015. A header cell that repeats across two grids on one page resolves to more
than one element, so its stability score is 0; that is the honest result of a locator that is not
unique.

## Navigation probing, as found on a dashboard

`--probe-navigation` clicks `button`, `role="link"` and `role="button"` elements outside forms. A
control that is a bare `div` or `span` with a click handler, an anchor with no `href`, or a button
inside a form is not clicked. A dashboard card built that way is therefore not reached by probing;
pass its page with `--url` or pick it. `role="button"` was added to the probed set by this change.

## Sign-in state across contexts, as found on a protected application

Every page is read in a context of its own, so each context has to be signed in. Starting every one from the state the sign-in produced works for an application whose session lives in a cookie it never changes. An application that hands out the next session token on every use (a single-use refresh token) accepts the original one for the first page only; a later context is sent to the sign-in page, and the sign-in form was read and registered as the page. A context therefore starts from the state the previous context ended with, and a page that ends on the identity's sign-in page stops the exploration with `EXPLORE_SIGNED_OUT` before anything is written. An application that keeps its session in session storage is not carried by either approach: session storage is not part of the state, and the error names the page instead of registering the sign-in form.
