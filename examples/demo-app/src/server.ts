// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { tasksRouter } from './routes/tasks.js';

export function createApp(): express.Express {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', fileURLToPath(new URL('../src/views', import.meta.url)));
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));
  app.use(express.urlencoded({ extended: false }));
  app.use(
    session({
      secret: process.env.DEMO_SESSION_SECRET ?? 'demo-app-session-secret',
      resave: false,
      saveUninitialized: false,
      // BUG-012: the session cookie is readable from client-side script (no `httpOnly`), which a
      // black-box security audit's cookie-flag check should flag.
      cookie: { httpOnly: false },
    }),
  );

  app.get('/', (_request, response) => {
    response.redirect('/dashboard');
  });
  app.use(authRouter);
  app.use(dashboardRouter);
  app.use(tasksRouter);
  app.use(adminRouter);

  app.use((_request, response) => {
    response.status(404).render('error', { message: 'Page not found.' });
  });

  return app;
}

function main(): void {
  const port = Number(process.env.DEMO_APP_PORT ?? 4310);
  createApp().listen(port, () => {
    console.log(`Demo app listening on http://localhost:${String(port)}`);
  });
}

main();
