// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Stands in for a search page (P6-98): its filters sit in a panel that is not in the DOM until the
// toggle opens it, its sortable headers and status chips are not natively interactive and carry only
// a test id, and a menu button, a destructive toggle and a card that navigates sit beside them.
const root = document.querySelector('app-root');

root.innerHTML =
  '<h1>Collapsed panel fixture</h1>' +
  '<button type="button" id="search-details" data-testid="search-details" aria-expanded="false">Search Details</button>' +
  '<div id="search-panel"></div>' +
  '<button type="button" id="actions-menu" aria-haspopup="menu" aria-expanded="false">Actions</button>' +
  '<button type="button" id="delete-section" aria-expanded="false">Delete section</button>' +
  '<span data-testid="sort-name" style="cursor: pointer">Name</span>' +
  '<span data-testid="sort-status" style="cursor: pointer">Status</span>' +
  '<status-chip data-testid="chip-open">Open</status-chip>' +
  '<div data-testid="plain-container"><p>No interaction here</p></div>' +
  '<div role="button" id="open-report" tabindex="0">Open the report</div>';

window.qaClicked = [];
for (const id of ['actions-menu', 'delete-section']) {
  document.getElementById(id).addEventListener('click', () => {
    window.qaClicked.push(id);
  });
}

const toggle = document.getElementById('search-details');
const panel = document.getElementById('search-panel');
toggle.addEventListener('click', () => {
  const isOpen = toggle.getAttribute('aria-expanded') === 'true';
  toggle.setAttribute('aria-expanded', String(!isOpen));
  panel.innerHTML = isOpen
    ? ''
    : '<label>Customer <input type="text" data-testid="filter-customer" /></label>' +
      '<button type="button" id="advanced" data-testid="advanced-toggle" aria-expanded="false">Advanced</button>' +
      '<div id="advanced-panel"></div>';
  if (!isOpen) {
    const advanced = document.getElementById('advanced');
    const advancedPanel = document.getElementById('advanced-panel');
    advanced.addEventListener('click', () => {
      advanced.setAttribute('aria-expanded', 'true');
      advancedPanel.innerHTML =
        '<label>Reference <input type="text" data-testid="filter-reference" /></label>';
    });
  }
});

document.getElementById('open-report').addEventListener('click', () => {
  window.location.assign('/spa-routes-overview.html');
});
