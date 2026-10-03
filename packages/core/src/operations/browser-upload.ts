// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { basename, isAbsolute, join, relative, sep } from 'node:path';
import { z } from 'zod';
import type { BrowserUploadedFile, Evidence } from '@qa-ai-stlc/schemas';
import { waitForBusyToClear } from '../browser-busy-wait.js';
import type { SessionNotice } from '../browser-session-store.js';
import { collectNotices } from '../browser-tabs.js';
import { readSelectedFileNames } from '../browser-upload-page.js';
import { resolveBrowserTarget } from '../element-refs.js';
import { QaError } from '../errors.js';
import { hashBytes } from '../hash.js';
import { scanForSecrets } from '../secret-scan.js';
import type { BrowserOperationContext } from './browser-context.js';
import { createBrowserEvidenceStore, registerBrowserAction } from './browser-evidence.js';

/** Files per call and bytes per file; an upload larger than this is not something a test case needs. */
export const MAX_UPLOAD_FILES = 10;
export const MAX_UPLOAD_FILE_BYTES = 10 * 1024 * 1024;

// The engine's own data and the repository's history are never test input.
const FORBIDDEN_TOP_LEVEL_DIRECTORIES: ReadonlySet<string> = new Set(['.qa', '.git']);

const MIME_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.txt': 'text/plain',
};

const SelectedFileNamesSchema = z.array(z.string());

export interface BrowserUploadOptions {
  readonly sessionId: string;
  /** A Playwright selector for the file input; give this or `ref`. */
  readonly selector?: string;
  /** A ref from the latest `qa.browser_snapshot`; give this or `selector`. */
  readonly ref?: string;
  /** Project-relative paths with forward slashes; nothing outside the project root is accepted. */
  readonly paths: readonly string[];
  /** `'step-<N>'`, `N` the case step's 1-based position, during an interactive execution session (P3-15). */
  readonly stepId?: string;
}

export interface BrowserUploadResult {
  readonly sessionId: string;
  readonly selector: string;
  /** Name, size and hash of each file sent. The content and the project path are never returned. */
  readonly files: BrowserUploadedFile[];
  readonly url: string;
  readonly evidence: Evidence;
  /** Dialogs and pages that appeared since a result last reported them (P6-59): page-controlled text, untrusted. */
  readonly notices?: SessionNotice[];
}

/**
 * MCP `qa.browser_upload` (P6-60): sets files on a file input. Each path must be project-relative
 * and, after symbolic links are resolved, still inside the project root and outside `.qa/` and
 * `.git/`. Each file is read once; those exact bytes are scanned for secrets, hashed and sent, so
 * the recorded hash is the hash of what the page received. The page is read back and must hold
 * the files by name, or the call is `BROWSER_UPLOAD_NOT_APPLIED` and registers nothing.
 */
export async function runBrowserUpload(
  context: BrowserOperationContext,
  options: BrowserUploadOptions,
): Promise<BrowserUploadResult> {
  const session = await context.sessions.get(options.sessionId);
  assertUploadCount(options.paths);
  // Everything about the files is checked before the page is touched.
  const uploads = await readUploads(context, options.paths);
  const evidenceStore = createBrowserEvidenceStore(context.engine);
  const target = await resolveBrowserTarget(session, options);

  await waitForBusyToClear(session);
  await session.page.setInputFiles(
    target.selector,
    uploads.map((upload) => ({
      name: upload.file.name,
      mimeType: upload.mimeType,
      buffer: Buffer.from(upload.bytes),
    })),
    { timeout: session.actionTimeoutMs },
  );
  await waitForBusyToClear(session);
  const shown = SelectedFileNamesSchema.safeParse(
    await session.page
      .locator(target.selector)
      .evaluate(readSelectedFileNames, undefined, { timeout: session.actionTimeoutMs }),
  );
  const files = uploads.map((upload) => upload.file);
  const names = files.map((file) => file.name);
  if (!shown.success || shown.data.join('\n') !== names.join('\n')) {
    throw new QaError(
      'BROWSER_UPLOAD_NOT_APPLIED',
      `After setting files on "${target.selector}" the page showed ${shown.success ? `[${shown.data.join(', ')}]` : 'no file input'}`,
      { remediation: 'Check that the selector is a file input, or an element that forwards to one.' },
    );
  }
  const url = session.page.url();

  const evidence = await registerBrowserAction({
    evidenceStore,
    evidenceId: context.sessions.nextEvidenceId(),
    session,
    now: context.engine.clock.now(),
    action: {
      type: 'upload',
      selector: target.selector,
      ...(target.ref === undefined ? {} : { ref: target.ref }),
      files,
      url,
    },
    ...(options.stepId !== undefined ? { stepId: options.stepId } : {}),
  });

  return {
    sessionId: session.sessionId,
    selector: target.selector,
    files,
    url,
    evidence,
    ...(await collectNotices(context, session)),
  };
}

function assertUploadCount(paths: readonly string[]): void {
  if (paths.length === 0 || paths.length > MAX_UPLOAD_FILES) {
    throw new QaError(
      'BROWSER_UPLOAD_INVALID',
      `Give between 1 and ${String(MAX_UPLOAD_FILES)} files, not ${String(paths.length)}`,
      { remediation: 'Upload the files in several calls, or fewer of them.' },
    );
  }
}

interface ReadUpload {
  readonly file: BrowserUploadedFile;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

async function readUploads(
  context: BrowserOperationContext,
  paths: readonly string[],
): Promise<ReadUpload[]> {
  const { fs, projectRoot } = context.engine;
  const realRoot = await fs.realPath(projectRoot);
  const uploads: ReadUpload[] = [];
  for (const path of paths) {
    const absolutePath = await resolveInsideProject(context, realRoot, path);
    const bytes = await fs.readBytes(absolutePath);
    if (bytes.byteLength > MAX_UPLOAD_FILE_BYTES) {
      throw new QaError(
        'BROWSER_UPLOAD_TOO_LARGE',
        `"${path}" is ${String(bytes.byteLength)} bytes; the limit is ${String(MAX_UPLOAD_FILE_BYTES)}`,
        { remediation: 'Use a smaller fixture file.' },
      );
    }
    const matches = scanForSecrets(new TextDecoder().decode(bytes));
    if (matches.length > 0) {
      throw new QaError(
        'BROWSER_UPLOAD_SECRET',
        `"${path}" matched ${matches.map((match) => match.pattern).join(', ')} and was not uploaded`,
        { remediation: 'Remove the secret from the fixture, or use a file with made-up content.' },
      );
    }
    const name = basename(absolutePath);
    uploads.push({
      file: { name, sizeBytes: bytes.byteLength, sha256: hashBytes(bytes) },
      mimeType: mimeTypeOf(name),
      bytes,
    });
  }
  return uploads;
}

async function resolveInsideProject(
  context: BrowserOperationContext,
  realRoot: string,
  path: string,
): Promise<string> {
  const { fs, projectRoot } = context.engine;
  if (path === '' || isAbsolute(path) || path.split(/[\\/]/).includes('..')) {
    throw outsideProject(path);
  }
  let realPath: string;
  try {
    realPath = await fs.realPath(join(projectRoot, ...path.split('/')));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new QaError('BROWSER_UPLOAD_FILE_MISSING', `"${path}" does not exist in the project`, {
        remediation: 'Check the path, relative to the project root.',
        cause: error,
      });
    }
    throw error;
  }
  const fromRoot = relative(realRoot, realPath);
  const [topLevel = ''] = fromRoot.split(sep);
  if (fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw outsideProject(path);
  }
  if (FORBIDDEN_TOP_LEVEL_DIRECTORIES.has(topLevel)) {
    throw new QaError(
      'BROWSER_UPLOAD_PATH_INVALID',
      `"${path}" is in ${topLevel}/, which is never uploaded`,
      {
        remediation: 'Copy the fixture into the project outside .qa/ and .git/.',
      },
    );
  }
  return realPath;
}

function outsideProject(path: string): QaError {
  return new QaError('BROWSER_UPLOAD_PATH_INVALID', `"${path}" is not a path inside the project`, {
    remediation:
      'Use a project-relative path with forward slashes, no "..", that does not leave the project through a symbolic link.',
  });
}

function mimeTypeOf(name: string): string {
  const dot = name.lastIndexOf('.');
  const known = dot < 0 ? undefined : MIME_TYPES_BY_EXTENSION[name.slice(dot).toLowerCase()];
  return known ?? 'application/octet-stream';
}
