/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { sleep } from '../testutil';
import { Commands } from '../../src/util/commands';
import {
  getDefaultConnectionId,
  handleMessageWithConnectionSettingsService
} from '../../src/connected/connectionsetup';
import { ConnectionSettingsService } from '../../src/settings/connectionsettings';
import { SonarLintExtendedLanguageClient } from '../../src/lsp/client';
import { assert } from 'chai';
import { Organization } from '../../src/lsp/protocol';

const TEN_SECONDS = 10_000;

async function deleteConnectedModeSettings() {
  await vscode.workspace.getConfiguration('sonarlint')
    .update('connectedMode.connections.sonarqube', undefined, vscode.ConfigurationTarget.Global);
  await vscode.workspace.getConfiguration('sonarlint')
    .update('connectedMode.connections.sonarcloud', undefined, vscode.ConfigurationTarget.Global);
}

const mockClient = {
  async checkConnection(connectionId: string) {
    return Promise.resolve({ connectionId, success: true });
  },
  async checkNewConnection(token: string, serverOrOrganization: string, isSonarQube: boolean) {
    return Promise.resolve({ connectionId: serverOrOrganization, success: true });
  },
  onTokenUpdate(connectionId, token) {
    // NOP
  },
  async listUserOrganizations(token: string) : Promise<Organization[]> {
    return Promise.resolve([]);
  }
} as SonarLintExtendedLanguageClient;

const mockSecretStorage = {
  store(a, b) {
    //nothing to do
  },
  get(a) {
    //nothing to do
  }
} as vscode.SecretStorage;

suite('Connection Setup', () => {

  const mockedConnectionSettingsService = new ConnectionSettingsService(mockSecretStorage, mockClient);
  const sleepTime = 2000;

  setup(async () => {
    await deleteConnectedModeSettings();
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  teardown(async () => {
    await deleteConnectedModeSettings();
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('should show SonarQube creation webview when command is called', async () => {
    const connectionsBefore = getSonarQubeConnections();
    assert.deepStrictEqual(connectionsBefore, []);

    await vscode.commands.executeCommand(Commands.CONNECT_TO_SONARQUBE);
    await sleep(sleepTime);

    const serverUrl = 'https://sonarqube.example';
    const token = 'definitely not a valid token';
    const disableNotifications = false;

    await handleMessageWithConnectionSettingsService({
      command: 'saveConnection',
      serverUrl,
      token,
      disableNotifications
    }, mockedConnectionSettingsService);
    await sleep(sleepTime);

    const connectionsAfter = getSonarQubeConnections();
    assert.deepStrictEqual(connectionsAfter, [{ connectionId: serverUrl, serverUrl }]);
  }).timeout(TEN_SECONDS);

  test('Should provide default connectionId', async () => {
    const connectionsBefore = getSonarQubeConnections();
    assert.deepStrictEqual(connectionsBefore, []);

    await vscode.commands.executeCommand(Commands.CONNECT_TO_SONARQUBE);
    await sleep(sleepTime);

    const serverUrl = 'https://sonarqube.example';
    const message = {
      command: 'saveConnection',
      serverUrl: serverUrl,
      token: 'myToken',
      disableNotifications: false
    };
    await handleMessageWithConnectionSettingsService(message, mockedConnectionSettingsService);
    await sleep(sleepTime);
    // @ts-ignore
    assert.ok(message.connectionId);
    // @ts-ignore
    assert.deepStrictEqual(message.connectionId, serverUrl);

  }).timeout(TEN_SECONDS);

  test('should show SonarCloud creation webview when command is called', async () => {
    const connectionsBefore = getSonarCloudConnections();
    assert.deepStrictEqual(connectionsBefore, []);

    await vscode.commands.executeCommand(Commands.CONNECT_TO_SONARCLOUD);
    await sleep(sleepTime);

    const token = 'definitely not a valid token';
    const organizationKey = 'my-organization';
    const disableNotifications = false;

    await handleMessageWithConnectionSettingsService({
      command: 'saveConnection',
      organizationKey,
      token,
      disableNotifications
    }, mockedConnectionSettingsService);
    await sleep(sleepTime);

    const connectionsAfter = getSonarCloudConnections();
    assert.deepStrictEqual(connectionsAfter, [{ connectionId:organizationKey, organizationKey }]);
  }).timeout(TEN_SECONDS);

  test('should edit default connection when command is called', async () => {
    const connectionsBefore = getSonarQubeConnections();
    assert.deepStrictEqual(connectionsBefore, []);

    const serverUrl = 'https://notsonarqube.example';
    const token = 'XXX SUPER SECRET TOKEN XXX';
    const disableNotifications = true;
    const message = {
      command: 'saveConnection',
      serverUrl,
      token,
      disableNotifications
    };

    const connectionId = getDefaultConnectionId(message)

    await ConnectionSettingsService.instance.addSonarQubeConnection({
      serverUrl,
      connectionId,
      token
    });
    await sleep(sleepTime);

    await vscode.commands.executeCommand(Commands.EDIT_SONARQUBE_CONNECTION, Promise.resolve({ id: connectionId }));

    await sleep(sleepTime);
    await handleMessageWithConnectionSettingsService(message, mockedConnectionSettingsService)
    await sleep(sleepTime);

    const connectionsAfter = getSonarQubeConnections();
    assert.deepStrictEqual(connectionsAfter, [{connectionId, serverUrl, disableNotifications }]);
  }).timeout(TEN_SECONDS);

  test('should edit identified SonarQube connection when command is called', async () => {
    const connectionsBefore = getSonarQubeConnections();
    assert.deepStrictEqual(connectionsBefore, []);

    const serverUrl = 'https://stillnotsonarqube.example';
    const token = 'XXX SUPER SECRET TOKEN XXX';
    const connectionId = 'My Little SonarQube';

    await ConnectionSettingsService.instance.addSonarQubeConnection(
      {
        connectionId,
        serverUrl,
        token
      }
    );

    await sleep(sleepTime);

    await vscode.commands.executeCommand(Commands.EDIT_SONARQUBE_CONNECTION, connectionId);
    await sleep(sleepTime);

    const disableNotifications = true;

    await handleMessageWithConnectionSettingsService({
      command: 'saveConnection',
      connectionId,
      serverUrl,
      token,
      disableNotifications
    }, mockedConnectionSettingsService);
    await sleep(sleepTime);

    const connectionsAfter = getSonarQubeConnections();
    assert.deepStrictEqual(connectionsAfter, [{ connectionId, serverUrl, disableNotifications }]);
  }).timeout(TEN_SECONDS);

  test('should edit identified SonarCloud connection when command is called', async () => {
    const connectionsBefore = getSonarCloudConnections();
    assert.deepStrictEqual(connectionsBefore, []);

    const organizationKey = 'another-organization';
    const token = 'XXX SUPER SECRET TOKEN XXX';
    const connectionId = 'My Little SonarCloud';

    await ConnectionSettingsService.instance.addSonarCloudConnection(
      {
        connectionId,
        organizationKey,
        token
      }
    );

    await sleep(sleepTime);

    await vscode.commands.executeCommand(Commands.EDIT_SONARCLOUD_CONNECTION, connectionId);
    await sleep(sleepTime);

    const disableNotifications = true;

    await handleMessageWithConnectionSettingsService({
      command: 'saveConnection',
      connectionId,
      organizationKey,
      token,
      disableNotifications
    }, mockedConnectionSettingsService);
    await sleep(sleepTime);

    const connectionsAfter = getSonarCloudConnections();
    assert.deepStrictEqual(connectionsAfter, [{ connectionId, organizationKey, disableNotifications }]);
  }).timeout(TEN_SECONDS);

  test('should NOT edit connection for which status check failed', async () => {
    const mockClient = {
      async checkNewConnection(token: string, serverOrOrganization: string, isSonarQube: boolean) {
        return Promise.resolve({ connectionId: serverOrOrganization, success: false });
      }
    } as SonarLintExtendedLanguageClient;

    const failingConnectionSettingsService = new ConnectionSettingsService(mockSecretStorage,mockClient);
    const connectionsBefore = getSonarQubeConnections();
    assert.deepStrictEqual(connectionsBefore, []);

    const serverUrl = 'https://stillnotsonarqube.example';
    const token = 'XXX SUPER SECRET TOKEN XXX';
    const connectionId = 'My Little SonarQube';

    await ConnectionSettingsService.instance.addSonarQubeConnection({
        connectionId,
        serverUrl,
        token
      }
    );

    await sleep(sleepTime);
    await vscode.commands.executeCommand(Commands.EDIT_SONARQUBE_CONNECTION, connectionId);
    await sleep(sleepTime);

    await handleMessageWithConnectionSettingsService({
      command: 'saveConnection',
      connectionId,
      serverUrl,
      token,
      disableNotifications: true
    }, failingConnectionSettingsService);
    await sleep(sleepTime);

    assert.deepStrictEqual(getSonarQubeConnections(), [{ serverUrl, connectionId }]);
  }).timeout(TEN_SECONDS);
});

function getSonarQubeConnections() {
  return vscode.workspace.getConfiguration('sonarlint').get('connectedMode.connections.sonarqube');
}

function getSonarCloudConnections() {
  return vscode.workspace.getConfiguration('sonarlint').get('connectedMode.connections.sonarcloud');
}
