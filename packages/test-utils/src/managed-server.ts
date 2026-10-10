// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from 'node:child_process';
import { connect, createServer } from 'node:net';

export interface ManagedServerOptions {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  /** The port the server is told to listen on; the helper owns it for the lifetime of the server. */
  readonly port: number;
  readonly startupTimeoutMs?: number;
  /** How long `stop()` waits for the process to exit and for its port to be released. */
  readonly stopTimeoutMs?: number;
}

export interface ManagedServer {
  /** Stops the server and returns once its port is free again. Safe to call more than once. */
  stop(): Promise<void>;
}

const DEFAULT_STARTUP_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 50;
const DEFAULT_STOP_TIMEOUT_MS = 10_000;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Whether something already accepts connections on `port`, on either loopback family. */
async function isPortAccepting(port: number): Promise<boolean> {
  for (const host of ['127.0.0.1', '::1']) {
    const isAccepting = await new Promise<boolean>((resolve) => {
      const socket = connect({ port, host });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (isAccepting) {
      return true;
    }
  }
  return false;
}

/** Whether the port can be bound, which also catches a listener on only one address family. */
async function canBind(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const probe = createServer();
    probe.once('error', () => {
      resolve(false);
    });
    probe.listen(port, () => {
      probe.close(() => {
        resolve(true);
      });
    });
  });
}

async function waitUntilPortFree(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await canBind(port))) {
    if (Date.now() >= deadline) {
      throw new Error(
        `Port ${String(port)} was still in use ${String(timeoutMs)} ms after the server was stopped.`,
      );
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

/** Resolves true when a running child exits, false when `timeoutMs` passes first. */
function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    // Only reached by a server that outlives its kill signal; see `stop()`.
    /* v8 ignore next 3 */
    const timer = setTimeout(() => {
      resolve(false);
    }, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/**
 * Starts a server process for an integration test and stops it reliably. The command must be the
 * server itself, not a wrapper such as `npm run start`: on Windows, killing a wrapper leaves the
 * server it launched running, listening on the test's fixed port, and the next run then talks to
 * that stale server (#597).
 *
 * Fails fast when the port is already taken, instead of silently testing against whatever answers.
 */
export async function startManagedServer(options: ManagedServerOptions): Promise<ManagedServer> {
  if (!(await canBind(options.port))) {
    throw new Error(
      `Port ${String(options.port)} is already in use, so a test server cannot start on it. A server from ` +
        'an earlier test run is probably still running; stop it and run the test again.',
    );
  }

  const child = spawn(options.command, [...options.args], {
    cwd: options.cwd,
    env: options.env,
    stdio: 'ignore',
    shell: false,
  });
  let spawnError: Error | undefined;
  child.once('error', (error) => {
    spawnError = error;
  });

  const stopTimeoutMs = options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS;
  const server: ManagedServer = {
    stop: async () => {
      if (!hasExited(child)) {
        child.kill();
        // A node server dies on this signal on every platform, so a process that outlives it is not
        // something a test can provoke portably.
        /* v8 ignore next 5 */
        if (!(await waitForExit(child, stopTimeoutMs))) {
          throw new Error(
            `The test server did not exit within ${String(stopTimeoutMs)} ms of being stopped.`,
          );
        }
      }
      await waitUntilPortFree(options.port, stopTimeoutMs);
    },
  };

  const startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
  const deadline = Date.now() + startupTimeoutMs;
  while (!(await isPortAccepting(options.port))) {
    const problem =
      spawnError !== undefined
        ? `could not be started: ${spawnError.message}`
        : child.exitCode !== null
          ? `exited with code ${String(child.exitCode)} before listening`
          : Date.now() >= deadline
            ? `did not listen on port ${String(options.port)} within ${String(startupTimeoutMs)} ms`
            : undefined;
    if (problem !== undefined) {
      try {
        await server.stop();
      } catch {
        // The startup failure below is the useful message; a server that never listened has
        // nothing more to report when it is cleaned up.
      }
      throw new Error(`The test server ${problem}.`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return server;
}
