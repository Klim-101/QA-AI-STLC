// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express';
import { currentUser, requireAuth } from '../auth.js';
import { users } from '../data.js';

export const adminRouter = Router();

// BUG-005: the "Admin" nav link is hidden from employees (see partials/_nav.ejs), but this route
// only checks that someone is logged in, not that they hold the admin role. Any authenticated
// user who navigates here directly sees the full user list.
adminRouter.get('/admin/users', requireAuth, (request, response) => {
  response.render('admin-users', { users, user: currentUser(request) });
});
