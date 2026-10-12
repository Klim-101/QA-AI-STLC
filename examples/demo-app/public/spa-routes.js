// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Stands in for a single-page application whose navigation has no `<a href>` (P6-78): one route is
// declared by a router attribute, one is pushed through the History API while the page loads, one
// is reached only by a button, and a "Sign out" button must never be clicked by a navigation probe.
const root = document.querySelector('app-root');

history.pushState(null, '', '/spa-routes.html?view=pushed');
history.replaceState(null, '', '/spa-routes.html');

root.innerHTML =
  '<h1>Router-only navigation fixture</h1>' +
  '<span routerLink="/spa-routes-overview.html">To Overview</span>' +
  '<button type="button" id="to-button-page">To Button Page</button>' +
  '<button type="button" id="sign-out">Sign out</button>' +
  '<form><button type="button" id="in-form">Inside a form</button></form>';

document.getElementById('to-button-page').addEventListener('click', () => {
  window.location.assign('/spa-routes-button.html');
});
document.getElementById('sign-out').addEventListener('click', () => {
  window.location.assign('/spa-routes-signout.html');
});
document.getElementById('in-form').addEventListener('click', () => {
  window.location.assign('/spa-routes-signout.html');
});
