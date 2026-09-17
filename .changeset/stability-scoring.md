---
'@qa-ai-stlc/explorer': minor
'@qa-ai-stlc/core': minor
---

Add stability scoring to `@qa-ai-stlc/explorer`: `scoreLocatorStability()` resolves one of P1-08's `LocatorCandidate`s against a live page and scores it 0..1 by verifying uniqueness now (a hard gate — a candidate resolving to anything but exactly one element scores 0), then survival across a page reload and each of a configurable set of viewport sizes (desktop/tablet/mobile by default). The original viewport is restored before returning, so scoring one element does not affect the next. `resolveCandidateLocator()` maps a candidate's strategy to the matching `AuthPage` locator method.

`@qa-ai-stlc/core`'s `AuthPage` port gained `getByRole()`, `getByTestId()`, `getByLabel()`, `getByPlaceholder()`, `getByText()`, `locator()` (each returning a `PageLocator` with `count()`), `reload()`, `setViewportSize()` and `viewportSize()`, mirroring Playwright's own `Page`/`Locator` API exactly so `playwrightBrowserLauncher` needs no glue code.
