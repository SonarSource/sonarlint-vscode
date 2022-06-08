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
  document.getElementById('connectionId').addEventListener('change', onChangeConnectionId);
  document.getElementById('connectionId').addEventListener('keyup', onChangeConnectionId);
  document.getElementById('serverUrl').addEventListener('change', onChangeServerUrl);
  document.getElementById('serverUrl').addEventListener('keyup', onChangeServerUrl);
  document.getElementById('generateToken').addEventListener('click', onClickGenerateToken);
  document.getElementById('token').addEventListener('change', onChangeToken);
  document.getElementById('token').addEventListener('keyup', onChangeToken);
  document.getElementById('saveConnection').addEventListener('click', onClickSaveConnection);
  tryRestoreState();
}

function onChangeConnectionId() {
  saveState();
}

function onChangeServerUrl() {
  saveState();
  toggleGenerateTokenButton();
}

function toggleGenerateTokenButton() {
  document.getElementById('generateToken').disabled = !document.getElementById('serverUrl').validity.valid;
}

function onClickGenerateToken() {
  const serverUrl = document.getElementById('serverUrl').value;
  vscode.postMessage({
    command: 'openTokenGenerationPage',
    serverUrl
  });
}

function onChangeToken() {
  saveState();
  toggleSaveConnectionButton();
}

function toggleSaveConnectionButton() {
  const serverUrl = document.getElementById('serverUrl');
  const token = document.getElementById('token');
  document.getElementById('saveConnection').disabled = !serverUrl.validity.valid && !token.validity.valid;
}

function onClickSaveConnection() {
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

function tryRestoreState() {
  const previousState = vscode.getState();
  if (previousState) {
    Object.entries(previousState).forEach(tryRestore);
  }
  toggleGenerateTokenButton();
  toggleSaveConnectionButton();
}

function tryRestore(keyValuePair) {
  const [key, value] = keyValuePair;
  const element = document.getElementById(key);
  if (element) {
    element.value = value;
  }
}

function saveState() {
  const stateToSave = {};
  for (const elementId of ['connectionId', 'serverUrl', 'token']) {
    const value = document.getElementById(elementId).value;
    if (value) {
      stateToSave[elementId] = value;
    }
  }
  vscode.setState(stateToSave);
}
