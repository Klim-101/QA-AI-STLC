// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Stands in for a single-page application that reads its product list with the QUERY method, a safe
// read that carries its parameters in a body, and that also has buttons which mutate with each of
// POST, PUT, PATCH and DELETE (ADR-0018). The list renders only once the QUERY has succeeded.
const root = document.querySelector('app-root');

async function start() {
  try {
    const response = await fetch('/api/spa/products', {
      method: 'QUERY',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'hand-tools' }),
    });
    if (!response.ok) {
      return;
    }
    const { products } = await response.json();
    root.innerHTML =
      '<h1>Read-by-QUERY fixture</h1><ul id="products">' +
      products.map((product) => '<li>' + product + '</li>').join('') +
      '</ul>' +
      ['POST', 'PUT', 'PATCH', 'DELETE']
        .map(
          (method) =>
            '<button type="button" id="mutate-' +
            method.toLowerCase() +
            '" data-method="' +
            method +
            '">' +
            method +
            '</button>',
        )
        .join('');
    for (const button of root.querySelectorAll('button[data-method]')) {
      button.addEventListener('click', () => {
        void fetch('/api/spa/mutations', { method: button.dataset.method });
      });
    }
  } catch {
    // A request safe mode aborts rejects here; the page then stays empty, which is what a test reads.
  }
}

void start();
