---
'@qa-ai-stlc/explorer': patch
---

The locator module derives every function name from the registered name instead of using it as written. A name that is a label ("Last GW ID", "Save & Close", "1st column", non-ASCII text, a reserved word) becomes a valid camelCase identifier, falling back to the element kind when nothing usable is left, and two labels that resolve to one name get a numeric suffix. A name that is already a valid identifier is kept unchanged.
