// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express';
import { currentUser, requireAuth } from '../auth.js';

export const dashboardRouter = Router();

dashboardRouter.get('/dashboard', requireAuth, (request, response) => {
  const user = currentUser(request);
  response.render('dashboard', { user });
});
