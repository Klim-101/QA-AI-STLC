---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/runner-security': minor
---

Add the identity-based black-box security checks. `authz` opens each restricted route as the privileged identity, as the low-privilege one and with no session, after confirming the low identity's session is alive; `csrf` replays each authorized mutation with a valid session, a foreign `Origin` and no anti-forgery token (the sign-out path is never replayed); `session` signs out and replays the old cookie on a page that tells signed-in from anonymous; `cookies` now also reads the flags of the cookies a signed-in identity's session holds. Identities sign in through their saved storage state or `authenticate()`; one that cannot makes the checks that need it `blocked`. A mutation in the authorization can now carry the complete request `body` and `contentType` the operator vouches for, which lets a refusal count as a pass. On the demo application the audit reports its catalogued security bugs (BUG-005, BUG-010, BUG-012).
