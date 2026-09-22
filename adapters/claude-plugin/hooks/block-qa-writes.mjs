// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Claude Code PreToolUse hook, shipped inside the generated plugin (P2-11): refuses a Write/Edit
// under .qa/**, the store only the engine may write (AGENTS.md section 5; .qa/ integrity, P2-07).
// This is layer 2 of that protection — the engine's own manifest/hash checks are layer 1 and still
// apply on a host without hooks (development plan section 2.6).
import { relative } from 'node:path';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function isUnderQaStore(filePath, cwd) {
  const relativePath = relative(cwd, filePath).replaceAll('\\', '/');
  return relativePath === '.qa' || relativePath.startsWith('.qa/');
}

const raw = await readStdin();
let payload;
try {
  payload = JSON.parse(raw);
} catch {
  // Malformed hook input is not this hook's job to diagnose; fail open rather than block an
  // unrelated tool call over a parsing problem.
  process.exit(0);
}

const filePath = payload?.tool_input?.file_path;
const cwd = typeof payload?.cwd === 'string' ? payload.cwd : process.cwd();

if (typeof filePath === 'string' && isUnderQaStore(filePath, cwd)) {
  process.stderr.write('Blocked: .qa/ is managed by the QA-AI-STLC engine, never edited by hand.\n');
  process.exit(2);
}

process.exit(0);
