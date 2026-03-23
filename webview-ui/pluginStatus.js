/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

const vscodeApi = acquireVsCodeApi();

window.addEventListener('message', function(event) {
  if (event.origin && !event.origin.startsWith('vscode-webview://')) {
    return;
  }

  if (event.data.command === 'updateContent') {
    const parser = new DOMParser();

    if (event.data.html !== undefined) {
      const doc = parser.parseFromString(event.data.html, 'text/html');
      const contentBlock = document.getElementById('content-block');
      if (contentBlock) {
        contentBlock.replaceChildren(...doc.body.childNodes);
      }
    }

    if (event.data.scopeSelectorHtml !== undefined) {
      const container = document.getElementById('scope-selector-container');
      if (container) {
        const selectorDoc = parser.parseFromString(event.data.scopeSelectorHtml, 'text/html');
        container.replaceChildren(...selectorDoc.body.childNodes);
      }
    }
    
    attachScopeSelectListener();
  }
});

// Event delegation on document: works across content-block replacements without re-registering.
let sortCurrentCol = -1;
let sortAscending = true;

document.addEventListener('click', function(event) {
  const btn = event.target.closest('.sort-btn');
  if (!btn) {
    return;
  }
  const col = Number.parseInt(btn.dataset.col, 10);
  if (sortCurrentCol === col) {
    sortAscending = !sortAscending;
  } else {
    sortCurrentCol = col;
    sortAscending = true;
  }

  document.querySelectorAll('.plugins-table th').forEach(function(th) {
    if (th.hasAttribute('aria-sort')) {
      th.setAttribute('aria-sort', 'none');
    }
  });
  btn.closest('th').setAttribute('aria-sort', sortAscending ? 'ascending' : 'descending');

  const tbody = document.querySelector('.plugins-table tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  rows.sort(function(a, b) {
    const aVal = (a.querySelectorAll('td')[col].dataset.sort || '').toLowerCase();
    const bVal = (b.querySelectorAll('td')[col].dataset.sort || '').toLowerCase();
    return sortAscending ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
  });
  rows.forEach(function(row) { tbody.appendChild(row); });
});

document.addEventListener('click', function(event) {
  if (event.target.id === 'setup-connection-btn') {
    vscodeApi.postMessage({ command: 'setupConnection' });
  } else if (event.target.id === 'bind-project-btn') {
    vscodeApi.postMessage({ command: 'bindProject' });
  }
});

document.addEventListener('click', function(event) {
  if (event.target.id === 'sonarqube-product-link') {
    event.preventDefault();
    vscodeApi.postMessage({ command: 'openSonarQubeProductPage' });
  }
});

function attachScopeSelectListener() {
  const scopeSelect = document.getElementById('scope-select');
  if (scopeSelect && !scopeSelect.dataset.listenerAttached) {
    scopeSelect.dataset.listenerAttached = 'true';
    scopeSelect.addEventListener('change', function() {
      vscodeApi.postMessage({ command: 'changeScope', configScopeId: scopeSelect.value });
    });
  }
}

attachScopeSelectListener();
