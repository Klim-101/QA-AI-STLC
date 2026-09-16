// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './server.js';

function adminAgent() {
  const agent = request.agent(createApp());
  return agent
    .post('/login')
    .type('form')
    .send({ email: 'admin@example.com', password: 'admin123' })
    .then(() => agent);
}

function employeeAgent() {
  const agent = request.agent(createApp());
  return agent
    .post('/login')
    .type('form')
    .send({ email: 'employee@example.com', password: 'employee123' })
    .then(() => agent);
}

describe('authentication', () => {
  it('redirects an unauthenticated request to the login page', async () => {
    const app = createApp();
    const response = await request(app).get('/dashboard');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/login');
  });

  it('logs in with valid credentials and reaches the dashboard', async () => {
    const agent = await adminAgent();
    const response = await agent.get('/dashboard');
    expect(response.status).toBe(200);
  });

  it('rejects invalid credentials with 401 and shows the login form again', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'admin@example.com', password: 'wrong' });
    expect(response.status).toBe(401);
    expect(response.text).toContain('Invalid email or password.');
  });
});

describe('BUG-005: admin-only route has no role check', () => {
  it('lets an authenticated employee load the admin user list', async () => {
    const agent = await employeeAgent();
    const response = await agent.get('/admin/users');
    expect(response.status).toBe(200);
    expect(response.text).toContain('admin@example.com');
  });
});

describe('BUG-007: dashboard greeting reads a field that does not exist', () => {
  it('renders an empty greeting instead of the display name', async () => {
    const agent = await adminAgent();
    const response = await agent.get('/dashboard');
    expect(response.text).toContain('<h1>Welcome, </h1>');
    expect(response.text).not.toContain('Alex Admin');
  });
});

describe('BUG-001: task creation has no server-side title validation', () => {
  it('creates a task with an empty title', async () => {
    const agent = await adminAgent();
    const response = await agent
      .post('/tasks')
      .type('form')
      .send({ title: '', priority: 'medium', assignee: '' });
    expect(response.status).toBe(302);
    const detail = await agent.get(response.headers.location!);
    expect(detail.status).toBe(200);
  });
});

describe('BUG-002: the status filter has no effect', () => {
  it('returns every task regardless of the requested status', async () => {
    const agent = await adminAgent();
    const unfiltered = await agent.get('/tasks');
    const filtered = await agent.get('/tasks?status=done');
    const countRows = (html: string) => html.split('<tr>').length;
    expect(countRows(filtered.text)).toBe(countRows(unfiltered.text));
  });
});

describe('BUG-003: the edit dialog cannot change the assignee', () => {
  it('keeps the original assignee after submitting a new one', async () => {
    const agent = await adminAgent();
    const created = await agent
      .post('/tasks')
      .type('form')
      .send({ title: 'Reassign me', priority: 'low', assignee: 'original@example.com' });
    const taskId = created.headers.location!;
    await agent
      .post(taskId)
      .type('form')
      .send({ title: 'Reassign me', priority: 'low', assignedTo: 'new@example.com' });
    const detail = await agent.get(taskId);
    expect(detail.text).toContain('original@example.com');
    expect(detail.text).not.toContain('new@example.com');
  });
});

describe('BUG-004: deleting a task does not remove it', () => {
  it('still shows the task at its detail page after deletion', async () => {
    const agent = await adminAgent();
    const created = await agent
      .post('/tasks')
      .type('form')
      .send({ title: 'Delete me', priority: 'low', assignee: '' });
    const taskId = created.headers.location!;
    const deleteResponse = await agent.post(`${taskId}/delete`);
    expect(deleteResponse.status).toBe(302);
    const detail = await agent.get(taskId);
    expect(detail.status).toBe(200);
    expect(detail.text).toContain('Delete me');
  });
});

describe('BUG-008: sorting by priority is alphabetical, not by severity', () => {
  it('places a medium-priority task after a low-priority one', async () => {
    const agent = await adminAgent();
    const response = await agent.get('/tasks?sort=priority');
    const lowIndex = response.text.indexOf('Reply to support ticket');
    const mediumIndex = response.text.indexOf('Review Q3 budget');
    expect(lowIndex).toBeGreaterThan(0);
    expect(mediumIndex).toBeGreaterThan(lowIndex);
  });
});

describe('BUG-009: editing a missing task creates a duplicate instead of failing', () => {
  it('creates a new task rather than returning 404', async () => {
    const agent = await adminAgent();
    const response = await agent
      .post('/tasks/does-not-exist')
      .type('form')
      .send({ title: 'Recovered from a stale dialog', priority: 'low', assignedTo: '' });
    expect(response.status).toBe(302);
    expect(response.headers.location).not.toBe('/tasks/does-not-exist');
  });
});

describe('BUG-010: the CSRF token is never verified', () => {
  it('accepts a task creation request with no CSRF token at all', async () => {
    const agent = await adminAgent();
    const response = await agent
      .post('/tasks')
      .type('form')
      .send({ title: 'No token here', priority: 'low', assignee: '' });
    expect(response.status).toBe(302);
  });
});

describe('BUG-012: the session cookie is missing HttpOnly', () => {
  it('sets the session cookie without the HttpOnly attribute', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'admin@example.com', password: 'admin123' });
    const setCookie = response.headers['set-cookie'] as unknown as string[];
    expect(setCookie[0]).not.toMatch(/HttpOnly/i);
  });
});
