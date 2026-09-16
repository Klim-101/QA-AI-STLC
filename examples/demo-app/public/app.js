// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

document.querySelectorAll('[data-open-dialog]').forEach((button) => {
  button.addEventListener('click', () => {
    const dialog = document.getElementById(button.getAttribute('data-open-dialog'));
    if (dialog instanceof HTMLDialogElement) {
      dialog.showModal();
    }
  });
});

document.querySelectorAll('[data-close-dialog]').forEach((button) => {
  button.addEventListener('click', () => {
    const dialog = document.getElementById(button.getAttribute('data-close-dialog'));
    if (dialog instanceof HTMLDialogElement) {
      dialog.close();
    }
  });
});
