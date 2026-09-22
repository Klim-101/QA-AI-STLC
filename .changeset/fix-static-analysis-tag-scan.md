---
'@qa-ai-stlc/explorer': patch
---

Fix static source analysis truncating a tag at the first `>` it finds, including one inside a
quoted attribute value or inside a `{...}` JSX/Vue/Angular expression container. An inline arrow
handler (`onClick={() => save()}`), one of the most common idioms in real frontend code, contains
a `>` well before the tag's real end, so any `data-testid`/`aria-label`/`role` written after it in
the same tag was never seen — the element was reported as missing a test id it actually has. The
scan now tracks quote and brace state instead of doing a bare `indexOf('>')`.
