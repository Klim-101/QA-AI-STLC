# Reading accessibility findings

A scan records the axe-core version and a hash of the `a11y` configuration it ran under, so two scans
are comparable only when both match. `violationCount` is a count, not a verdict.

| Bucket       | Meaning                                                               | Report as         |
| ------------ | --------------------------------------------------------------------- | ----------------- |
| `violations` | a rule failed on an element                                           | failed            |
| `uncertain`  | axe-core could not decide (text over a gradient, say); a person looks | uncertain         |
| `excepted`   | accepted in config, each with a reason                                | accepted, visible |
| expired      | an exception whose date passed; counted as a violation again          | failed            |

Group by rule id, then order by impact (`critical`, `serious`, `moderate`, `minor`). For each group give
the rule, its impact, how many elements, one or two example selectors and the evidence path. Do not
paste whole node lists.

## Limits to state

- Automated rules cover only part of WCAG; a clean scan is not a conformance claim.
- Only the scanned page in its scanned state was checked: a dialog, a validation error or a logged-in
  view needs its own scan.
- The configured version and level decide which rules ran; a finding against a higher level is out of
  the target, not a failure.
