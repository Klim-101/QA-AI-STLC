// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Host-specific wording inside the one canonical Markdown source (P5-03). A group opens with
// `<!-- host: <name> -->`, may switch branch with another such line, and closes with
// `<!-- /host -->`; rendering for a host keeps only its branch and drops the markers. Text outside
// a group is shared. A group never nests, and a host with no branch gets nothing from the group.
// Prettier keeps a blank line after an HTML comment, so a blank line that follows a marker is
// dropped when the output already ends in one, which keeps the rendered text free of doubled blanks.
export const KNOWN_HOSTS = ['claude-code', 'codex'];

const OPEN_OR_SWITCH = /^<!-- host: ([a-z-]+) -->\s*$/;
const CLOSE = /^<!-- \/host -->\s*$/;

/** The text of `markdown` as `host` should see it; throws on a malformed or unknown marker. */
export function renderForHost(markdown, host, sourceName = 'markdown') {
  if (!KNOWN_HOSTS.includes(host)) {
    throw new Error(`Unknown host "${host}"; expected one of ${KNOWN_HOSTS.join(', ')}.`);
  }
  const output = [];
  let branchHost;
  let followsMarker = false;
  markdown.split('\n').forEach((line, index) => {
    const where = `${sourceName}:${String(index + 1)}`;
    const afterMarker = followsMarker;
    followsMarker = false;
    const marker = OPEN_OR_SWITCH.exec(line);
    if (marker?.[1] !== undefined) {
      if (!KNOWN_HOSTS.includes(marker[1])) {
        throw new Error(`${where}: unknown host "${marker[1]}" in a host marker.`);
      }
      branchHost = marker[1];
      followsMarker = true;
      return;
    }
    if (CLOSE.test(line)) {
      if (branchHost === undefined) {
        throw new Error(`${where}: "<!-- /host -->" without an open host group.`);
      }
      branchHost = undefined;
      followsMarker = true;
      return;
    }
    if (afterMarker && line === '' && output[output.length - 1] === '') {
      return;
    }
    if (branchHost === undefined || branchHost === host) {
      output.push(line);
    }
  });
  if (branchHost !== undefined) {
    throw new Error(`${sourceName}: a host group is never closed.`);
  }
  return output.join('\n');
}
