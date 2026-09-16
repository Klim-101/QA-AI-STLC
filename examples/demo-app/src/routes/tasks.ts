// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express';
import { currentUser, requireAuth } from '../auth.js';
import { createTask, findTask, tasks } from '../data.js';
import { ensureCsrfToken } from '../csrf.js';
import { formField, priorityField } from '../form.js';

export const tasksRouter = Router();

// Express 5 types a route param as `string | string[] | undefined` to account for wildcard
// patterns; the `:id` segment used here always matches a single string when the route matches.
function taskIdParam(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

tasksRouter.get('/tasks', requireAuth, (request, response) => {
  const statusFilter = typeof request.query.status === 'string' ? request.query.status : undefined;
  // BUG-002: `statusFilter` is read above but never applied — the table always lists every task
  // regardless of the selected filter.
  const visible = tasks;

  const sortByPriority = request.query.sort === 'priority';
  const rows = sortByPriority
    ? // BUG-008: sorts the priority label as a string ("high" < "low" < "medium"), not by actual
      // severity rank, so "medium" tasks appear last instead of second.
      [...visible].sort((a, b) => a.priority.localeCompare(b.priority))
    : visible;

  response.render('tasks-list', { tasks: rows, statusFilter, sortByPriority, user: currentUser(request) });
});

tasksRouter.get('/tasks/new', requireAuth, (request, response) => {
  response.render('tasks-new', { csrfToken: ensureCsrfToken(request), user: currentUser(request) });
});

tasksRouter.post('/tasks', requireAuth, (request, response) => {
  const title = formField(request.body, 'title');
  const priority = priorityField(request.body, 'priority', 'medium');
  const assignee = formField(request.body, 'assignee');
  // BUG-001: no server-side check that `title` is non-empty; the form's `required` attribute is
  // the only guard, so submitting without JavaScript (or via a direct POST) creates a blank task.
  const task = createTask({ title, priority, assignee });
  response.redirect(`/tasks/${task.id}`);
});

tasksRouter.get('/tasks/:id', requireAuth, (request, response) => {
  const task = findTask(taskIdParam(request.params.id));
  if (task === undefined) {
    response.status(404).render('error', { message: 'Task not found.' });
    return;
  }
  response.render('task-detail', {
    task,
    csrfToken: ensureCsrfToken(request),
    deleted: request.query.deleted === '1',
    user: currentUser(request),
  });
});

tasksRouter.post('/tasks/:id', requireAuth, (request, response) => {
  const task = findTask(taskIdParam(request.params.id));
  if (task === undefined) {
    // BUG-009: a dialog opened before the task was deleted in another tab still submits here;
    // instead of reporting that the task is gone, this silently creates a new one from the
    // stale form data.
    const title = formField(request.body, 'title');
    const priority = priorityField(request.body, 'priority', 'medium');
    const assignedTo = formField(request.body, 'assignedTo');
    const created = createTask({ title, priority, assignee: assignedTo });
    response.redirect(`/tasks/${created.id}`);
    return;
  }
  const title = formField(request.body, 'title');
  if (title.length > 0) {
    task.title = title;
  }
  task.priority = priorityField(request.body, 'priority', task.priority);
  // BUG-003: the edit form's assignee field is named `assignedTo`, but this reads `assignee`,
  // which the form never sends — the assignee silently never changes.
  const assignee = formField(request.body, 'assignee');
  if (assignee.length > 0) {
    task.assignee = assignee;
  }
  response.redirect(`/tasks/${task.id}`);
});

tasksRouter.post('/tasks/:id/delete', requireAuth, (request, response) => {
  const task = findTask(taskIdParam(request.params.id));
  // BUG-004: reports success and redirects as if the task were removed, but never actually
  // splices it out of `tasks` — it reappears in the list and at its own detail page.
  if (task !== undefined) {
    response.redirect('/tasks?deleted=1');
    return;
  }
  response.status(404).render('error', { message: 'Task not found.' });
});
