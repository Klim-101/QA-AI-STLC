// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// The page is busy for a short, fixed time after load and after each refresh, then the mask goes
// away and the Save button starts working. A click that lands while the mask is up is dropped, as
// in an application whose handlers react only once its data has loaded.
const BUSY_MS = 1500;

const status = document.getElementById('save-status');
const isHeld = new URLSearchParams(location.search).get('hold') === '1';
let isReady = false;

function showMask() {
  isReady = false;
  const mask = document.createElement('div');
  mask.className = 'k-loading-mask';
  mask.setAttribute('role', 'progressbar');
  mask.setAttribute('aria-label', 'Loading');
  document.body.append(mask);
  if (!isHeld) {
    setTimeout(() => {
      mask.remove();
      isReady = true;
    }, BUSY_MS);
  }
}

document.getElementById('save').addEventListener('click', () => {
  if (isReady) {
    status.textContent = 'Saved.';
  }
});
document.getElementById('refresh').addEventListener('click', showMask);

showMask();
