/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

const vscode = acquireVsCodeApi();
import { selectFirstOrganization, addNoOrgInfoMessage,
   addManualInputOption, addDefaultSelection, populateDropdown } from './organizationsDropdownHelper.js';

window.addEventListener('load', init);
window.addEventListener('message', handleMessage);

function byId(elementId) {
  return document.getElementById(elementId);
}

function init() {
  byId('connectionId').addEventListener('change', onChangeConnectionId);
  byId('connectionId').addEventListener('keyup', onChangeConnectionId);
  const serverUrl = byId('serverUrl');
  if (serverUrl) {
    serverUrl.addEventListener('change', onChangeServerUrl);
    serverUrl.addEventListener('keyup', onChangeServerUrl);
    if (serverUrl.value !== '') {
      onChangeServerUrl();
    }
  }
  const organizationKey = byId('organizationKey');
  if (organizationKey) {
    organizationKey.addEventListener('change', onChangeOrganizationKey);
    organizationKey.addEventListener('keyup', onChangeOrganizationKey);
    if (organizationKey.value !== '') {
      onChangeOrganizationKey();
    }
  }
  byId('generateToken').addEventListener('click', onClickGenerateToken);
  byId('token').addEventListener('change', onChangeToken);
  byId('enableNotifications').addEventListener('change', onChangeEnableNotifications);
  byId('saveConnection').addEventListener('click', onClickSaveConnection);
  byId('sonarqubeCloudFreeSignUp')?.addEventListener('click', onClickSonarCloudFreeSignupLink);
  byId('sonarQubeEditionsDownloads')?.addEventListener('click', onClickSonarQubeDownloadsPage);
  tryRestoreState();
}

function onChangeConnectionId() {
  // If connection ID is manually changed, we should stop updating it when the URL changes
  byId('shouldGenerateConnectionId').value = 'false';
  saveState();
  toggleSaveConnectionButton();
}

function onChangeServerUrl() {
  saveState();
  if (byId('shouldGenerateConnectionId').value === 'true') {
    byId('connectionId').value = sanitize(byId('serverUrl').value);
  }
  toggleGenerateTokenButton();
  toggleSaveConnectionButton();
}

function onChangeOrganizationKey() {
  saveState();
  const manualInput = byId('manualOrganizationKey');
  if (byId('shouldGenerateConnectionId').value === 'true') {
    const organizationKey = byId('organizationKey');
    const value = organizationKey.value === 'organizationKeyManualInput' 
      ? byId('manualOrganizationKey').value 
      : organizationKey.value;
    byId('connectionId').value = sanitize(value);
  }
  if (byId('organizationKey').value) {
    byId('organizationKey').setAttribute('selected', true);
    if (byId('organizationKey').value === 'organizationKeyManualInput') {
      console.log('about to show manual input');
      manualInput.removeAttribute('hidden');
      manualInput.focus();
      // Add listeners to sync manual input with organizationKey
      manualInput.addEventListener('change', () => {
        byId('organizationKey').value = 'organizationKeyManualInput';
        byId('organizationKey').setAttribute('selected', true);
        onChangeOrganizationKey();
      });
      manualInput.addEventListener('keyup', () => {
        byId('organizationKey').value = 'organizationKeyManualInput';
        byId('organizationKey').setAttribute('selected', true);
        onChangeOrganizationKey();
      });
    } else {
      manualInput.setAttribute('hidden', true);
    }
  }
  toggleSaveConnectionButton();
}

function toggleGenerateTokenButton() {
  byId('generateToken').disabled = byId('serverUrl') && !hasValidRequiredField();
}

function hasValidRequiredField() {
  if (byId('serverUrl')) {
    return hasValidServerUrl();
  } else {
    return hasValidOrganizationKey();
  }
}

function hasValidServerUrl() {
  /**
   * @type {HTMLInputElement}
   */
  const serverUrlInput = byId('serverUrl');
  return serverUrlInput.validity.valid && isValidUrl(serverUrlInput.value);
}

function isValidUrl(value) {
  try {
    const parsedUrl = new URL(value);
    return /^https?:$/.test(parsedUrl.protocol);
  } catch (e) {
    return false;
  }
}

function hasValidOrganizationKey() {
  const organizationKeyInput = byId('organizationKey');
  if (organizationKeyInput.value === 'other') {
    const manualInput = byId('manualOrganizationKey');
    return manualInput && manualInput.value.length > 0;
  }
  return organizationKeyInput.getAttribute('selected') && organizationKeyInput.value.length > 0;
}

function onClickGenerateToken() {
  /**
   * @type {HTMLInputElement}
   */
  const serverUrlElement = byId('serverUrl');
  const initialOrganizationKey = byId('organizationKey-initial');
  let serverUrl;
  let region = null;
  let preFilledOrganizationKey = '';
  if (serverUrlElement) {
    serverUrl = serverUrlElement.value;
  } else {
    const regionField = byId('region');
    region = regionField ? regionField.value : 'EU';
    serverUrl = region === 'US' ? 'https://sonarqube.us/' : 'https://sonarcloud.io';
    preFilledOrganizationKey = initialOrganizationKey ? initialOrganizationKey.value : '';
  }
  byId('tokenGenerationProgress').classList.remove('hidden');
  vscode.postMessage({
    command: 'openTokenGenerationPage',
    serverUrl,
    region,
    preFilledOrganizationKey
  });
}

function onChangeToken() {
  saveState();
  toggleSaveConnectionButton();
  const regionField = byId('region');
  const initialOrganizationKey = byId('organizationKey-initial');
  const tokenChangedMessage = {
    command: 'tokenChanged',
    token: byId('token').value,
    region: regionField ? regionField.value : 'EU',
    preFilledOrganizationKey: initialOrganizationKey ? initialOrganizationKey.value : ''
  };
  vscode.postMessage(tokenChangedMessage);
}

function hasValidToken() {
  /**
   * @type {HTMLInputElement}
   */
  const token = byId('token');
  return token.validity.valid && token.value.length > 0;
}

function toggleSaveConnectionButton() {
  byId('saveConnection').disabled = !hasUnsavedChanges() || !hasValidRequiredField() || !hasValidToken();
}

function onChangeEnableNotifications() {
  saveState();
  toggleSaveConnectionButton();
}

function onClickSaveConnection() {
  const connectionId = byId('connectionId').value;
  const projectKey = byId('projectKey').value;
  const folderUri = byId('folderUri').value;
  const token = byId('token').value;
  const isFromSharedConfiguration = byId('isFromSharedConfiguration').value;
  const disableNotifications = !byId('enableNotifications').checked;
  const regionField = byId('region');
  const region = regionField ? regionField.value : 'EU';
  const saveConnectionMessage = {
    command: 'saveConnection',
    connectionId,
    token,
    disableNotifications,
    projectKey,
    folderUri,
    isFromSharedConfiguration,
    region
  };
  const serverUrl = byId('serverUrl');
  if (serverUrl) {
    saveConnectionMessage.serverUrl = serverUrl.value;
  }
  const organizationKey = byId('organizationKey');
  if (organizationKey) {
    saveConnectionMessage.organizationKey = organizationKey.value === 'organizationKeyManualInput' ? byId('manualOrganizationKey').value : organizationKey.value;
  }
  vscode.postMessage(saveConnectionMessage);
}

function onClickSonarCloudFreeSignupLink() {
  vscode.postMessage({ command: 'sonarCloudFreeSignupPageLinkClick' });
}

function onClickSonarQubeDownloadsPage() {
  vscode.postMessage({ command: 'sonarQubeEditionsDownloadsLinkClick' });
}

function tryRestoreState() {
  const previousState = vscode.getState();
  if (previousState) {
    Object.entries(previousState).forEach(tryRestore);
    byId('enableNotifications').checked = previousState.enableNotifications;
  }
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
  for (const elementId of ['connectionId', 'organizationKey', 'serverUrl', 'token', 'shouldGenerateConnectionId']) {
    /**
     * @type {HTMLInputElement}
     */
    const inputElement = byId(elementId);
    if (inputElement) {
      const value = inputElement.value;
      if (value) {
        stateToSave[elementId] = value;
      }
    }
  }
  stateToSave.enableNotifications = byId('enableNotifications').checked;
  vscode.setState(stateToSave);
}

function hasUnsavedChanges() {
  /**
   * @type {HTMLInputElement}
   */
  const enableNotifications = byId('enableNotifications');
  const enableNotificationsInitial = byId('enableNotifications-initial').value === 'true';
  const enableNotificationsHasChanged = enableNotifications.checked !== enableNotificationsInitial;
  return enableNotificationsHasChanged || ['connectionId', 'organizationKey', 'serverUrl', 'token'].some(hasChanged);
}

function hasChanged(elementId) {
  /**
   * @type {HTMLInputElement}
   */
  const element = byId(elementId);
  /**
   * @type {HTMLInputElement}
   */
  const initial = byId(`${elementId}-initial`);
  return element && initial && (element.value !== initial.value);
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
    case 'tokenReceived':
      populateTokenField(message.token);
      break;
    case 'tokenGenerationPageIsOpen':
      tokenGenerationPageIsOpen(message.errorMessage);
      break;
    case 'organizationListReceived':
      replaceOrganizationDropdown(message.organizations, message.preFilledOrganizationKey);
      break;
  }
}

function connectionCheckStart() {
  byId('connectionProgress').classList.remove('hidden');
  byId('connectionStatus').innerText = 'Checking connection...';
}

function connectionCheckSuccess() {
  byId('tokenStatus').classList.add('hidden');
  byId('connectionProgress').classList.add('hidden');
  byId('connectionStatus').innerText = 'Success!';
}

function connectionCheckFailure(reason) {
  byId('tokenStatus').classList.add('hidden');
  byId('connectionProgress').classList.add('hidden');
  byId('connectionStatus').innerText = `Failed: ${reason}`;
}

function populateTokenField(token) {
  byId('token').value = token;
  byId('tokenStatus').innerText = 'Token Received!';
  byId('tokenStatus').classList.remove('hidden');
  toggleSaveConnectionButton();
  saveState();
}

function replaceOrganizationDropdown(organizations, preFilledOrganizationKey) {
  const dropdown = byId('organizationKey');
  dropdown.innerHTML = '';
  // Remove any existing messages
  const existingMessage = dropdown.parentElement.querySelector('.no-org-info-message');
  if (existingMessage) {
    existingMessage.remove();
  }
  // If there is a pre-filled organization key, select it and populate the dropdown; Otherwise, go with the normal flow
  if (preFilledOrganizationKey) {
    // Remove the pre-filled organization key from the list of organizations so that it's not duplicated in the dropdown
    const maybeMatchingOrganization = organizations.find(org => org.key === preFilledOrganizationKey);
    const preFilledOrganization = maybeMatchingOrganization || { key: preFilledOrganizationKey, name: preFilledOrganizationKey, description: '' };
    organizations = organizations.filter(org => org.key !== preFilledOrganizationKey);
    selectFirstOrganization(dropdown, [preFilledOrganization, ...organizations]);
    dropdown.dispatchEvent(new Event('change'));
    populateDropdown(dropdown, organizations);
  } else if (organizations.length === 0) {
    addNoOrgInfoMessage(dropdown);
    // Trigger change event with manual input selection
    dropdown.dispatchEvent(new Event('change'));
  } else if (organizations.length === 1) {
    selectFirstOrganization(dropdown, organizations);
    dropdown.dispatchEvent(new Event('change'));
  } else {
    addDefaultSelection(dropdown);
    populateDropdown(dropdown, organizations);
  }
  
  addManualInputOption(dropdown);
}

function tokenGenerationPageIsOpen(errorMessage) {
  byId('tokenGenerationResult').innerText = '';
  byId('tokenGenerationProgress').classList.add('hidden');
  if (errorMessage) {
    byId('tokenGenerationResult').innerText = errorMessage;
  }
}

function sanitize(serverUrl) {
  return (serverUrl || '').replace(/[^a-z\d]+/gi, '-');
}
