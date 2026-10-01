---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/explorer': minor
'@qa-ai-stlc/cli': minor
---

Add the component-library profile mechanism to the explorer. A profile selected by `ui.componentLibrary` is data: widget recognizers (a DOM signature, the widget kind and ARIA role, and the hidden native controls that only back the widget), generated-id patterns that locator synthesis rejects, and busy indicators the explorer waits out before reading a page. A recognized widget is registered on its visible wrapper as one element, with its widget kind, library and the popup it opens (read from `aria-controls`/`aria-owns`, since the popup is usually attached to `body`). No library profile ships yet; the Kendo profiles follow.
