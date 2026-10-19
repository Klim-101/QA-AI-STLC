// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Stands in for a single-page application served from one port that reads its data from an API on
// another port, as a development setup does (ADR-0019). The API port is given as ?api=<port>; the
// page also asks a second port, ?other=<port>, which an allowlist would not name, and shows what
// each request returned.
const root = document.querySelector('app-root');
const parameters = new URLSearchParams(window.location.search);

async function readProducts(port) {
  try {
    const response = await fetch('http://localhost:' + port + '/api/cross/products');
    return response.ok ? (await response.json()).products : [];
  } catch {
    // A request safe mode aborts rejects here; the page then shows nothing for that port.
    return [];
  }
}

async function start() {
  const fromApi = await readProducts(parameters.get('api'));
  const fromOther = await readProducts(parameters.get('other'));
  root.innerHTML =
    '<h1>API-on-another-port fixture</h1>' +
    '<ul id="products">' +
    fromApi.map((product) => '<li>' + product + '</li>').join('') +
    '</ul>' +
    '<p id="other-count">Other port: ' +
    fromOther.length +
    ' products</p>';
}

void start();
