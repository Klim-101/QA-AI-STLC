---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/mcp-server': patch
---

`qa.browser_expect` with kind `text`, `value` or `url` now accepts an expected value sent as a number or boolean and compares its string form. A client that turned a numeric-looking value such as a gateway id into a number was refused with `BROWSER_EXPECT_INVALID`. A value sent as a string keeps every digit, leading zeros included; `count` still needs a whole number and `checked` only a boolean.
