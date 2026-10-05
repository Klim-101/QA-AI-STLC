// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Stands in for a single-page application: the document loads with an empty root element, and the
// content is rendered a moment after the load event. `?hold=1` keeps the busy indicator forever.
const root = document.querySelector('app-root');
const hold = new URLSearchParams(window.location.search).get('hold') === '1';
const spinner = document.createElement('div');
spinner.className = 'k-loading-mask';
spinner.setAttribute('role', 'progressbar');

window.addEventListener('load', () => {
  root.append(spinner);
  setTimeout(() => {
    if (hold) {
      return;
    }
    spinner.remove();
    root.innerHTML =
      '<h1>Client-rendered fixture</h1>' +
      '<a href="/spa-fixture-detail.html">Details</a>' +
      '<button type="button" data-testid="spa-save">Save</button>';
  }, 1200);
});
