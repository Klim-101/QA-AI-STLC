// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express';

const TEXT = {
  en: { title: 'Sign in', heading: 'Sign in to the shop', button: 'Sign in', link: 'Categories' },
  es: {
    title: 'Iniciar sesión',
    heading: 'Inicia sesión en la tienda',
    button: 'Iniciar sesión',
    link: 'Categorías',
  },
} as const;

/**
 * `GET /localized` renders its text in the language the browser asks for (`Accept-Language`;
 * Spanish when it starts with "es", English otherwise), as a multilingual shop does. Not one of the
 * catalogued bugs: it lets a test show that the language an environment pins, not the machine's own,
 * decides the text and so the element names a registry holds (P6-114).
 */
export function createLocalizedRouter(): Router {
  const router = Router();

  router.get('/localized', (request, response) => {
    const text = request.acceptsLanguages('es', 'en') === 'es' ? TEXT.es : TEXT.en;
    response.type('html').send(
      `<!doctype html>
<html lang="${text === TEXT.es ? 'es' : 'en'}">
<head><meta charset="utf-8"><title>${text.title}</title></head>
<body>
<h1>${text.heading}</h1>
<a href="/dashboard">${text.link}</a>
<button type="button">${text.button}</button>
</body>
</html>
`,
    );
  });

  return router;
}
