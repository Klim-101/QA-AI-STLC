// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

export type Role = 'admin' | 'employee';

export interface User {
  readonly id: string;
  readonly email: string;
  readonly password: string;
  readonly role: Role;
  // BUG-007 (src/views/dashboard.ejs): the dashboard template reads `user.name`, which no User
  // ever has, instead of this field, so every account's greeting is always empty.
  readonly displayName?: string;
}

export interface Task {
  id: string;
  title: string;
  status: 'open' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  assignee: string;
}

export const users: readonly User[] = [
  {
    id: 'u-admin',
    email: 'admin@example.com',
    password: 'admin123',
    role: 'admin',
    displayName: 'Alex Admin',
  },
  { id: 'u-employee', email: 'employee@example.com', password: 'employee123', role: 'employee' },
];

// Reset on every server restart; this is a fixture, not a persistence layer.
export const tasks: Task[] = [
  {
    id: 't-1',
    title: 'Set up onboarding checklist',
    status: 'open',
    priority: 'high',
    assignee: 'Alex Admin',
  },
  { id: 't-2', title: 'Review Q3 budget', status: 'in-progress', priority: 'medium', assignee: 'Alex Admin' },
  {
    id: 't-3',
    title: 'Reply to support ticket #482',
    status: 'open',
    priority: 'low',
    assignee: 'employee@example.com',
  },
];

let nextTaskId = tasks.length + 1;

export function createTask(input: {
  readonly title: string;
  readonly priority: Task['priority'];
  readonly assignee: string;
}): Task {
  const task: Task = {
    id: `t-${String(nextTaskId)}`,
    title: input.title,
    status: 'open',
    priority: input.priority,
    assignee: input.assignee,
  };
  nextTaskId += 1;
  tasks.push(task);
  return task;
}

export function findTask(id: string): Task | undefined {
  return tasks.find((task) => task.id === id);
}

export function findUserByEmail(email: string): User | undefined {
  return users.find((user) => user.email === email);
}
