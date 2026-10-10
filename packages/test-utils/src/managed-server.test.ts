// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { createServer, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { startManagedServer, type ManagedServer } from './managed-server.js';

const LISTEN_SCRIPT =
  "require('node:http').createServer((q, r) => r.end('ok')).listen(Number(process.env.PORT))";

async function freePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => {
        resolve(port);
      });
    });
  });
}

const running: ManagedServer[] = [];
const occupiers: Server[] = [];

afterEach(async () => {
  for (const server of running.splice(0)) {
    await server.stop();
  }
  for (const occupier of occupiers.splice(0)) {
    await new Promise<void>((resolve) =>
      occupier.close(() => {
        resolve();
      }),
    );
  }
});

function nodeServer(port: number, script: string, options: { readonly startupTimeoutMs?: number } = {}) {
  return startManagedServer({
    command: process.execPath,
    args: ['-e', script],
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    port,
    ...options,
  });
}

describe('startManagedServer', () => {
  it('starts a server that answers, and frees its port when stopped', async () => {
    const port = await freePort();
    const server = await nodeServer(port, LISTEN_SCRIPT);

    const response = await fetch(`http://127.0.0.1:${String(port)}/`);
    expect(await response.text()).toBe('ok');

    await server.stop();
    await expect(fetch(`http://127.0.0.1:${String(port)}/`)).rejects.toThrow();
    // The port can be taken again at once, which is what the next test run needs.
    const next = await nodeServer(port, LISTEN_SCRIPT);
    running.push(next);
  }, 30_000);

  it('can be stopped more than once', async () => {
    const port = await freePort();
    const server = await nodeServer(port, LISTEN_SCRIPT);

    await server.stop();

    await expect(server.stop()).resolves.toBeUndefined();
  }, 30_000);

  it('refuses to start when the port is already in use, instead of reusing what answers', async () => {
    const port = await freePort();
    const occupier = createServer();
    occupiers.push(occupier);
    await new Promise<void>((resolve) =>
      occupier.listen(port, () => {
        resolve();
      }),
    );

    await expect(nodeServer(port, LISTEN_SCRIPT)).rejects.toThrow(/already in use/);
  });

  it('reports a server that exits before it listens', async () => {
    const port = await freePort();

    await expect(nodeServer(port, 'process.exit(3)')).rejects.toThrow(/exited with code 3 before listening/);
  }, 30_000);

  it('reports a server that never listens, and stops it', async () => {
    const port = await freePort();

    await expect(
      nodeServer(port, 'setTimeout(() => undefined, 60000)', { startupTimeoutMs: 300 }),
    ).rejects.toThrow(/did not listen on port \d+ within 300 ms/);
  }, 30_000);

  it('reports a command that cannot be started', async () => {
    const port = await freePort();

    await expect(
      startManagedServer({
        command: 'qa-ai-stlc-no-such-command',
        args: [],
        cwd: process.cwd(),
        env: process.env,
        port,
        startupTimeoutMs: 5_000,
      }),
    ).rejects.toThrow(/could not be started/);
  }, 30_000);

  it('uses the default startup timeout when none is given', async () => {
    const port = await freePort();
    const server = await nodeServer(port, LISTEN_SCRIPT);
    running.push(server);

    expect((await fetch(`http://127.0.0.1:${String(port)}/`)).ok).toBe(true);
  }, 30_000);

  it('reports a port that stays in use after the server stopped', async () => {
    const port = await freePort();
    // The "server" starts a detached helper that keeps the port, then exits itself: stopping it
    // cannot free the port, which is the leak this helper exists to surface.
    const script = [
      "const { spawn } = require('node:child_process');",
      "const helper = spawn(process.execPath, ['-e', \"require('node:http').createServer().listen(Number(process.env.PORT)); setTimeout(() => process.exit(0), 3000)\"], { detached: true, stdio: 'ignore', env: process.env });",
      'helper.unref();',
      'setTimeout(() => process.exit(0), 1500);',
    ].join('\n');
    const server = await startManagedServer({
      command: process.execPath,
      args: ['-e', script],
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port) },
      port,
      stopTimeoutMs: 200,
    });

    await expect(server.stop()).rejects.toThrow(/still in use/);
    // Let the helper end on its own so it does not outlive the test.
    await new Promise((resolve) => setTimeout(resolve, 3500));
  }, 30_000);
});
