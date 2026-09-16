// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express';
import { findUserByEmail } from '../data.js';
import { formField } from '../form.js';
import '../session.js';

export const authRouter = Router();

authRouter.get('/login', (request, response) => {
  response.render('login', { error: undefined });
});

authRouter.post('/login', (request, response) => {
  const email = formField(request.body, 'email');
  const password = formField(request.body, 'password');
  const user = findUserByEmail(email);
  if (user?.password !== password) {
    response.status(401).render('login', { error: 'Invalid email or password.' });
    return;
  }
  request.session.userId = user.id;
  response.redirect('/dashboard');
});

authRouter.post('/logout', (request, response) => {
  request.session.destroy(() => {
    response.redirect('/login');
  });
});
