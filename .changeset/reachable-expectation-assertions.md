---
'@qa-ai-stlc/core': patch
---

Generation verification now requires a declared expectation's assertion to be a statement that always runs. An assertion inside a condition on a value, a loop, a `try`, an uncalled function, a skipped or un-awaited `test.step`, after a `return` or `throw`, or with a `.catch(...)` chained onto it is answered with `expectations_missing` and a message that says the line is written but may never run. A literal `if (true)` or a plain block still counts.
