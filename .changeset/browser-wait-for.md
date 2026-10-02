---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

`qa.browser_wait_for` waits for an element to be visible, hidden, attached or detached, for text to appear or disappear (on the page or inside one element), or for the URL to match, and registers a `wait-for` evidence record with what it waited for and how long it took. It never waits longer than the environment action timeout; a condition that never holds is `BROWSER_WAIT_TIMEOUT` naming it and registers nothing, and a malformed call is `BROWSER_WAIT_INVALID`. Looking at an element that vanishes between being counted and being read now reports it as gone instead of waiting out the action timeout, which also applies to `qa.browser_expect`.
