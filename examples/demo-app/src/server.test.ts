// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { KENDO_PEOPLE_TOTAL } from './routes/kendo.js';
import { DEMO_CLIENT_ID, DEMO_CLIENT_SECRET } from './routes/oauth.js';
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

describe('session-by-POST fixture endpoints (ADR-0014)', () => {
  it('opens a session with a POST and counts the orders a POST creates', async () => {
    const app = createApp();

    expect((await request(app).post('/api/spa/session')).body).toEqual({ ok: true });
    expect((await request(app).get('/api/spa/orders')).body).toEqual({ orders: 0 });
    expect((await request(app).post('/api/spa/orders')).status).toBe(201);
    expect((await request(app).get('/api/spa/orders')).body).toEqual({ orders: 1 });
  });
});

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

describe('fake OAuth2 token endpoint', () => {
  const credentials = {
    grant_type: 'client_credentials',
    client_id: DEMO_CLIENT_ID,
    client_secret: DEMO_CLIENT_SECRET,
  };

  it('issues a token for the demo client and accepts it on the protected route', async () => {
    const app = createApp();
    const token = await request(app).post('/oauth/token').type('form').send(credentials);
    const accessToken = (token.body as { access_token: string }).access_token;
    const whoami = await request(app).get('/api/whoami').set('Authorization', `Bearer ${accessToken}`);

    expect(token.status).toBe(200);
    expect(token.body).toMatchObject({ token_type: 'Bearer', expires_in: 3600 });
    expect(whoami.status).toBe(200);
    expect(whoami.body).toEqual({ client: DEMO_CLIENT_ID, token: accessToken });
  });

  it('rejects an unsupported grant and wrong client credentials', async () => {
    const app = createApp();
    const grant = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ ...credentials, grant_type: 'password' });
    const client = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ ...credentials, client_secret: 'wrong' });

    expect(grant.status).toBe(400);
    expect(client.status).toBe(401);
  });

  it('answers 401 without a token, with an unknown token, and after every token is revoked', async () => {
    const app = createApp();
    const token = await request(app).post('/oauth/token').type('form').send(credentials);
    const auth = { Authorization: `Bearer ${(token.body as { access_token: string }).access_token}` };

    const missing = await request(app).get('/api/whoami');
    const unknown = await request(app).get('/api/whoami').set('Authorization', 'Bearer nope');
    await request(app).post('/oauth/revoke-all');
    const revoked = await request(app).get('/api/whoami').set(auth);

    expect([missing.status, unknown.status, revoked.status]).toEqual([401, 401, 401]);
  });

  it('hands the token demo page a live token', async () => {
    const app = createApp();
    const issued = await request(app).get('/oauth/demo-token');
    const token = (issued.body as { access_token: string }).access_token;
    const whoami = await request(app).get('/api/whoami').set('Authorization', `Bearer ${token}`);
    const page = await request(app).get('/token-demo.html');

    expect(whoami.status).toBe(200);
    expect(page.status).toBe(200);
    expect(page.text).toContain('sessionStorage.setItem');
  });

  it('counts the tokens it has issued', async () => {
    const app = createApp();
    await request(app).post('/oauth/token').type('form').send(credentials);
    await request(app).post('/oauth/token').type('form').send(credentials);

    expect((await request(app).get('/oauth/issued')).body).toEqual({ issued: 2 });
  });
});

describe('Kendo UI for jQuery fixture', () => {
  async function publicFile(name: string): Promise<string> {
    return readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');
  }

  it('serves the fixture page and the third-party assets it loads from dev dependencies', async () => {
    const app = createApp();
    const responses = await Promise.all(
      [
        '/kendo-jquery.html',
        '/vendor/jquery/jquery.min.js',
        '/vendor/kendo/kendo.ui.core.min.js',
        '/vendor/kendo-theme/all.css',
      ].map((path) => request(app).get(path)),
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
  });

  it('pages through the people API', async () => {
    const page = await request(createApp()).get('/api/kendo/people?skip=10&take=10');
    const body = page.body as { total: number; items: { id: number }[] };

    expect(body.total).toBe(KENDO_PEOPLE_TOTAL);
    expect(body.items.map((person) => person.id)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it('defaults and bounds the paging parameters', async () => {
    const app = createApp();
    const defaults = await request(app).get('/api/kendo/people?skip=-3&take=abc');
    const oversized = await request(app).get('/api/kendo/people?take=100000');

    expect((defaults.body as { items: unknown[] }).items).toHaveLength(10);
    expect((oversized.body as { items: unknown[] }).items).toHaveLength(100);
  });

  it('BUG-013: drops the last row of a page that runs past the end', async () => {
    const page = await request(createApp()).get('/api/kendo/people?skip=110&take=10');
    const ids = (page.body as { items: { id: number }[] }).items.map((person) => person.id);

    expect(ids).toEqual([111, 112, 113, 114, 115, 116]);
  });

  it('BUG-014: creates the due-date DatePicker without a minimum', async () => {
    const script = await publicFile('kendo-jquery.js');

    expect(script).toContain("kendoDatePicker({ format: 'yyyy-MM-dd' })");
  });

  it('BUG-015: leaves the Priority label unassociated with its control', async () => {
    const page = await publicFile('kendo-jquery.html');

    expect(page).toContain('<label>Priority</label>');
  });

  it('BUG-016: never writes the applied note out of the edit window', async () => {
    const script = await publicFile('kendo-jquery.js');

    expect(script).not.toContain('applied-note');
  });
});

describe('Kendo UI for Angular structure fixture', () => {
  async function publicFile(name: string): Promise<string> {
    return readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');
  }

  it('serves the fixture page and its script', async () => {
    const app = createApp();
    const responses = await Promise.all(
      ['/kendo-angular.html', '/kendo-angular.js', '/kendo-angular.css'].map((path) =>
        request(app).get(path),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
  });

  it('declares one custom element per widget kind', async () => {
    const page = await publicFile('kendo-angular.html');

    for (const tag of [
      'kendo-tabstrip',
      'kendo-dropdownlist',
      'kendo-combobox',
      'kendo-multiselect',
      'kendo-datepicker',
      'kendo-numerictextbox',
      'kendo-grid',
    ]) {
      expect(page).toContain(`<${tag}`);
    }
  });

  it('BUG-017: never writes the picked option into the dropdown text', async () => {
    const script = await publicFile('kendo-angular.js');

    expect(script).not.toContain('text.textContent');
  });

  it('BUG-018: commits a typed effort value without clamping it', async () => {
    const script = await publicFile('kendo-angular.js');

    expect(script).toContain('set(Number(input.value));');
  });

  it('BUG-019: creates the edit window dialog without a labelling title', async () => {
    const script = await publicFile('kendo-angular.js');

    expect(script).toContain("{ class: 'k-window k-window-md', role: 'dialog' }");
  });
});
