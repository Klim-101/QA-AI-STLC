// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { z } from 'zod';
import type { FileSystem } from './ports/file-system.js';
import { QaError } from './errors.js';

// Two spaces, a trailing newline, and no other formatting choice, so the same value serializes
// to byte-identical content on every OS and every run (AGENTS.md 12.6).
export function toCanonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function readJsonFile<Schema extends z.ZodType>(
  fs: FileSystem,
  absolutePath: string,
  schema: Schema,
): Promise<z.infer<Schema>> {
  const raw = await fs.readFile(absolutePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new QaError('JSON_FILE_MALFORMED', `"${absolutePath}" is not valid JSON`, { cause: error });
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new QaError('JSON_FILE_INVALID', `"${absolutePath}" does not match its schema`, {
      cause: result.error,
    });
  }
  return result.data;
}

export async function writeJsonFile(fs: FileSystem, absolutePath: string, value: unknown): Promise<void> {
  await fs.writeFile(absolutePath, toCanonicalJson(value));
}
