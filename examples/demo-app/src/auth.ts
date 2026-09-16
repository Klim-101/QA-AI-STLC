// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { NextFunction, Request, Response } from 'express';
import { users, type Role, type User } from './data.js';
import './session.js';

export function currentUser(request: Request): User | undefined {
  const userId = request.session.userId;
  return userId === undefined ? undefined : users.find((user) => user.id === userId);
}

export function requireAuth(request: Request, response: Response, next: NextFunction): void {
  if (currentUser(request) === undefined) {
    response.redirect('/login');
    return;
  }
  next();
}

export function requireRole(role: Role) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const user = currentUser(request);
    if (user === undefined) {
      response.redirect('/login');
      return;
    }
    if (user.role !== role) {
      response.status(403).render('error', { message: 'You do not have access to this page.' });
      return;
    }
    next();
  };
}
