// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Stands in for a single-page application that opens its session with a POST on every load, as one
// that exchanges a refresh cookie for an access token does: it renders its content only once that
// request has succeeded, and nothing at all when it has not (ADR-0014).
const root = document.querySelector('app-root');

async function start() {
  try {
    const response = await fetch('/api/spa/session', { method: 'POST' });
    if (!response.ok) {
      return;
    }
  } catch {
    return;
  }
  root.innerHTML =
    '<h1>Session-by-POST fixture</h1>' +
    '<a href="/spa-fixture-detail.html">Details</a>' +
    '<button type="button" id="place-order" data-testid="place-order">Place order</button>';
  document.getElementById('place-order').addEventListener('click', () => {
    void fetch('/api/spa/orders', { method: 'POST' });
  });
}

void start();
