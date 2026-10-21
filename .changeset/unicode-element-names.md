---
'@qa-ai-stlc/explorer': patch
---

Element names derived from an accessible name keep accented and non-Latin letters. A Latin accent folds into its base letter ("Iniciar sesión" gives `iniciarSesion`), and a name in another script such as Cyrillic keeps its letters instead of losing them. A name already stored in a registry is not renamed, because generated code references it; only elements registered from now on get the new rule.
