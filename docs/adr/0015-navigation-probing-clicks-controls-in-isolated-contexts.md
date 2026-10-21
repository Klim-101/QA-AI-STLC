# ADR-0015: Exploration may click navigation-only controls, in isolated contexts

Status: Accepted
Date: 2026-10-12

## Context

The crawler finds pages through `<a href>` links only. A
single-page application often navigates with something else: a button whose click handler calls the
router, an element with a router directive, a route pushed through the History API. On a real Angular
application `qa explore` visited `/`, `/version` and `/dashboard`, and the page behind a "To Node
Overview" button was never reached, so its elements never entered the registry.

Safe mode (AGENTS.md 12.4, ADR-005) lets an exploration session load pages and nothing else. The
question this ADR settles is whether exploration may _click_, which no exploration session has done
before. A click can run any code of the application. Safe mode aborts every non-GET request (and
every request off the allowlist), but a click can still reach a server through a GET that changes
state (`GET /logout`), or change what the application keeps in the browser.

Most of the gap needs no click: a router attribute and a History API call are visible in the page.

## Decision

Routes are discovered in three steps, in this order of risk.

1. **Router attributes.** Every page is read for `routerLink`, `ng-reflect-router-link` and
   `data-href` values, resolved to absolute http(s) URLs. Nothing is clicked.
2. **History API.** An init script, installed before the page's own scripts, records the URL of each
   `pushState` and `replaceState` call. The wrapper calls the original unchanged and keeps at most
   500 entries. Nothing is clicked.
3. **Navigation probing, off unless asked for** (`qa explore --probe-navigation`, `probeNavigation`
   on `qa.explore`). For a page the crawl visited, each `button`, `role="link"` and `role="button"` element that is
   outside any form, not a submit or reset button, not disabled, not an anchor with an `href`, and
   visible, is clicked in a fresh browser context. Rules:
   - **Isolated.** Each probe has its own context with the crawl's session and TLS setting, loads the
     page, clicks one control, reads the resulting URL, and is closed. Whatever the click changed in
     the browser is discarded with it.
   - **Same safe mode.** The context carries the same handler as the crawl, installed on the context
     so a popup is covered: allowlist, non-GET abort, `safeNonGetRequests` (ADR-0014) and request
     logging. No probe relaxes it.
   - **Kept only when clean.** The destination counts only if it differs from the page, is on the
     allowlist, and safe mode aborted no request during the probe. Otherwise the route is dropped, and
     the aborted request is still counted and reported.
   - **Named like a destructive control: skipped.** A control whose text, `aria-label` or `title`
     contains sign out, log out, delete, remove, destroy, erase, reset, unsubscribe, deactivate or
     revoke is not clicked. This is a second line for an application that does these through a GET.
     It matches English only and is not a guarantee.
   - **Bounded.** At most 10 controls per page, and the crawl's `maxPages` still applies to the pages
     they lead to.
   - **Visible.** The route map records how each route was found (`router-attribute`, `history-api`,
     `click-probe`, next to `link`), and the explore report states how many controls were clicked
     when probing was on.

Probing is chosen per run by the operator or the agent that asks for it; no configuration key turns
it on, and no environment can make it the default.

A bare `div` or `span` with a click handler, an anchor with no `href` and a button inside a form are
not clicked; pass such a page with `--url` or pick it.

**Not adopted:**

- Probing by default. It is slow (a page load per control) and the only exploration step that can
  trigger a GET side effect.
- Clicking in the crawl's own page. A click could leave the page in a state that changes what the next
  link extraction sees, and nothing would undo it.
- Clicking controls inside forms, or submit buttons. Those are submissions by definition.
- A configurable denylist or allowlist of control names in this change. The fixed list is small and
  the operator's control over scope is the flag itself.

## Consequences

An application whose navigation has no link can be explored without manual pick mode, and the route
map says which routes needed a click.

The guarantee for an exploration session changes from "performs no action" to "performs no action
unless probing was asked for, and then only clicks outside forms, in discarded contexts, under safe
mode". An application that changes server state through a GET behind a harmlessly named button is
still exposed: the operator who turns probing on accepts that, as with `safeNonGetRequests` in
ADR-0014. The protection is that it is opt-in per run, bounded, reported, and run only against the
environments the operator already allowed to be explored.

A control that opens a dialog, toggles a menu or navigates to the same URL yields no route, which is
the intended result. A route reachable only through a multi-step interaction (open a menu, then click
an entry) is not found; pick mode remains the tool for it.

The probe needs a page load per control, so a run with probing on takes noticeably longer than one
without.

AGENTS.md 12.4 names this exception next to the ADR-0009 and ADR-0014 ones.
