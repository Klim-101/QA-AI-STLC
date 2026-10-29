// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// A plugin ships `skills/`, `hub/`, `phase-prompts/` and `references/` at its root, with no `agents/`
// folder above them. A link whose visible label names a path must name the file the link points at,
// either written as the link writes it (relative to the file that holds it) or measured from the
// plugin root. A label such as `agents/references/x.md` is neither, and sends an agent looking for a
// folder the installed plugin does not have.
import { posix } from 'node:path';

const PATH_LABEL_LINK = /\[`([^`\s]*\/[^`\s]*)`\]\(([^)\s]+)\)/gu;
const EXTERNAL_TARGET = /^(?:[a-z][a-z0-9+.-]*:|#)/iu;

function stripTrailingSlash(path) {
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * Returns the links in `markdown` whose code-formatted path label names neither where the link
 * points, as written, nor that place measured from the plugin root. `filePath` is the file's path
 * from that root, using `/`. A label with a `<placeholder>` stands for one of several files, so
 * only its folder is compared.
 */
export function findMismatchedLinkLabels(markdown, filePath) {
  const mismatches = [];
  for (const [index, line] of markdown.split('\n').entries()) {
    for (const [, label, target] of line.matchAll(PATH_LABEL_LINK)) {
      if (EXTERNAL_TARGET.test(target)) {
        continue;
      }
      const [targetPath = ''] = target.split('#');
      const resolved = stripTrailingSlash(posix.join(posix.dirname(filePath), targetPath));
      const written = stripTrailingSlash(posix.normalize(targetPath));
      const named = label.includes('<') ? stripTrailingSlash(posix.dirname(label)) : label;
      if (named !== resolved && named !== written) {
        mismatches.push({ line: index + 1, label, target, resolved });
      }
    }
  }
  return mismatches;
}
