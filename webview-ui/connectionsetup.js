/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

const vscode = acquireVsCodeApi();

window.addEventListener('load', init);

function init() {
  document.getElementById('serverUrl').addEventListener('change', toggleTokenGenerationButton);
  document.getElementById('generateToken').addEventListener('click', openTokenGenerationPage);
  document.getElementById('token').addEventListener('change', toggleTokenSaveButton);
  document.getElementById('saveConnection').addEventListener('click', saveConnection);
}

function toggleTokenGenerationButton() {
  document.getElementById('generateToken').disabled = !document.getElementById('serverUrl').validity.valid;
}

function openTokenGenerationPage() {
  const serverUrl = document.getElementById('serverUrl').value;
  vscode.postMessage({
    command: 'openTokenGenerationPage',
    serverUrl
  });
}

function toggleTokenSaveButton() {
  const serverUrl = document.getElementById('serverUrl');
  const token = document.getElementById('token');
  document.getElementById('saveConnection').disabled = !serverUrl.validity.valid && !token.validity.valid;
}

function saveConnection() {
  const connectionId = document.getElementById('connectionId').value;
  const serverUrl = document.getElementById('serverUrl').value;
  const token = document.getElementById('token').value;
  vscode.postMessage({
    command: 'saveConnection',
    connectionId,
    serverUrl,
    token
  });
}
