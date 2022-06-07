/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

const vscode = acquireVsCodeApi();

window.addEventListener('load', init);
window.addEventListener('message', handleMessage);

function byId(elementId) {
  return document.getElementById(elementId);
}

function init() {
  byId('connectionId').addEventListener('change', onChangeConnectionId);
  byId('connectionId').addEventListener('keyup', onChangeConnectionId);
  byId('serverUrl').addEventListener('change', onChangeServerUrl);
  byId('serverUrl').addEventListener('keyup', onChangeServerUrl);
  byId('generateToken').addEventListener('click', onClickGenerateToken);
  byId('token').addEventListener('change', onChangeToken);
  byId('token').addEventListener('keyup', onChangeToken);
  byId('enableNotifications').addEventListener('change', onChangeEnableNotifications);
  byId('saveConnection').addEventListener('click', onClickSaveConnection);
  tryRestoreState();
}

function onChangeConnectionId() {
  saveState();
}

function onChangeServerUrl() {
  saveState();
  byId('connectionId').value = sanitize(byId('serverUrl').value);
  toggleGenerateTokenButton();
}

function toggleGenerateTokenButton() {
  byId('generateToken').disabled = !byId('serverUrl').validity.valid;
}

function onClickGenerateToken() {
  const serverUrl = byId('serverUrl').value;
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
  const serverUrl = byId('serverUrl');
  const token = byId('token');
  byId('saveConnection').disabled = !serverUrl.validity.valid && !token.validity.valid;
}

function onChangeEnableNotifications() {
  saveState();
}

function onClickSaveConnection() {
  const connectionId = byId('connectionId').value;
  const serverUrl = byId('serverUrl').value;
  const token = byId('token').value;
  const disableNotifications = !byId('enableNotifications').checked;
  vscode.postMessage({
    command: 'saveConnection',
    connectionId,
    serverUrl,
    token,
    disableNotifications
  });
}

function tryRestoreState() {
  const previousState = vscode.getState();
  if (previousState) {
    Object.entries(previousState).forEach(tryRestore);
  }
  byId('enableNotifications').checked = previousState.enableNotifications;
  toggleGenerateTokenButton();
  toggleSaveConnectionButton();
}

function tryRestore(keyValuePair) {
  const [key, value] = keyValuePair;
  const element = byId(key);
  if (element) {
    element.value = value;
  }
}

function saveState() {
  const stateToSave = {};
  for (const elementId of ['connectionId', 'serverUrl', 'token']) {
    const value = byId(elementId).value;
    if (value) {
      stateToSave[elementId] = value;
    }
  }
  stateToSave.enableNotifications = byId('enableNotifications').checked;
  vscode.setState(stateToSave);
}

function handleMessage(event) {
  const message = event.data;
  switch (message.command) {
    case 'connectionCheckStart':
      connectionCheckStart();
      break;
    case 'connectionCheckSuccess':
      connectionCheckSuccess();
      break;
    case 'connectionCheckFailure':
      connectionCheckFailure(message.reason);
      break;
  }
}

function connectionCheckStart() {
  byId('connectionProgress').classList.remove('hidden');
  byId('connectionStatus').innerText = 'Checking connection...';
}

function connectionCheckSuccess() {
  byId('connectionProgress').classList.add('hidden');
  byId('connectionStatus').innerText = 'Success!';
}

function connectionCheckFailure(reason) {
  byId('connectionProgress').classList.add('hidden');
  byId('connectionStatus').innerText = `Failed: ${reason}`;
}

function sanitize(serverUrl) {
  return (serverUrl || '').replace(/[^a-z\d]+/gi, '-');
}
