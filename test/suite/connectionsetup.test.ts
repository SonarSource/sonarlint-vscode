/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { sleep } from '../testutil';
import { Commands } from '../../src/util/commands';
import {
  getDefaultConnectionId,
  handleMessageWithConnectionSettingsService,
  handleInvalidTokenNotification
} from '../../src/connected/connectionsetup';
import { ConnectionSettingsService } from '../../src/settings/connectionsettings';
import { SonarLintExtendedLanguageClient } from '../../src/lsp/client';
import { assert } from 'chai';
import { ExtendedServer } from '../../src/lsp/protocol';

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
  async listUserOrganizations(token: string, region: string) : Promise<ExtendedServer.Organization[]> {
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

  test('should edit identified SonarCloud connection when command is called', async function () {
    this.skip();
    const connectionsBefore = getSonarCloudConnections();
    assert.deepStrictEqual(connectionsBefore, []);

    const organizationKey = 'another-organization';
    const token = 'XXX SUPER SECRET TOKEN XXX';
    const connectionId = 'My Little SonarCloud';
    const region = 'EU';

    await ConnectionSettingsService.instance.addSonarCloudConnection(
      {
        connectionId,
        organizationKey,
        token,
        region
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
      disableNotifications,
      region
    }, mockedConnectionSettingsService);
    await sleep(sleepTime);

    const connectionsAfter = getSonarCloudConnections();
    assert.deepStrictEqual(connectionsAfter, [{ connectionId, organizationKey, disableNotifications, region }]);
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

suite('handleInvalidTokenNotification', () => {
  let connectionServiceInstanceStub: sinon.SinonStub;
  let getSonarQubeConnectionsStub: sinon.SinonStub;
  let getSonarCloudConnectionsStub: sinon.SinonStub;
  let showErrorMessageStub: sinon.SinonStub;
  let executeCommandStub: sinon.SinonStub;

  setup(() => {
    // Create individual stubs for the methods
    getSonarQubeConnectionsStub = sinon.stub();
    getSonarCloudConnectionsStub = sinon.stub();
    
    // Create a mock instance with the stubbed methods
    const mockInstance = {
      getSonarQubeConnections: getSonarQubeConnectionsStub,
      getSonarCloudConnections: getSonarCloudConnectionsStub
    };
    
    // Stub the static instance property
    connectionServiceInstanceStub = sinon.stub(ConnectionSettingsService, 'instance').get(() => mockInstance);
    
    showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
    executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');
  });

  teardown(() => {
    sinon.restore();
  });

  test('should execute EDIT_SONARQUBE_CONNECTION and focus ConnectedMode view when connectionId exists in SonarQube connections and user clicks Edit', async () => {
    const connectionId = 'my-sonarqube-connection';
    const mockSonarQubeConnections = [
      { connectionId: 'other-connection', serverUrl: 'https://other.example' },
      { connectionId: connectionId, serverUrl: 'https://sonarqube.example' }
    ];
    const mockSonarCloudConnections = [];

    getSonarQubeConnectionsStub.returns(mockSonarQubeConnections);
    getSonarCloudConnectionsStub.returns(mockSonarCloudConnections);
    showErrorMessageStub.resolves('Edit Connection');

    await handleInvalidTokenNotification(connectionId);

    assert.isTrue(showErrorMessageStub.calledOnce);
    assert.isTrue(showErrorMessageStub.calledWith(
      `Connection to '${connectionId}' failed: Please verify your token.`,
      'Edit Connection'
    ));
    assert.isTrue(executeCommandStub.calledTwice);
    assert.isTrue(executeCommandStub.calledWith(Commands.EDIT_SONARQUBE_CONNECTION, connectionId));
    assert.isTrue(executeCommandStub.calledWith('SonarLint.ConnectedMode.focus'));
  });

  test('should execute EDIT_SONARCLOUD_CONNECTION and focus ConnectedMode view when connectionId exists in SonarCloud connections and user clicks Edit', async () => {
    const connectionId = 'my-sonarcloud-connection';
    const mockSonarQubeConnections = [];
    const mockSonarCloudConnections = [
      { connectionId: 'other-connection', organizationKey: 'other-org' },
      { connectionId: connectionId, organizationKey: 'my-org' }
    ];

    getSonarQubeConnectionsStub.returns(mockSonarQubeConnections);
    getSonarCloudConnectionsStub.returns(mockSonarCloudConnections);
    showErrorMessageStub.resolves('Edit Connection');

    await handleInvalidTokenNotification(connectionId);

    assert.isTrue(showErrorMessageStub.calledOnce);
    assert.isTrue(showErrorMessageStub.calledWith(
      `Connection to '${connectionId}' failed: Please verify your token.`,
      'Edit Connection'
    ));
    assert.isTrue(executeCommandStub.calledTwice);
    assert.isTrue(executeCommandStub.calledWith(Commands.EDIT_SONARCLOUD_CONNECTION, connectionId));
    assert.isTrue(executeCommandStub.calledWith('SonarLint.ConnectedMode.focus'));
  });

  test('should not execute any command when user dismisses the error dialog', async () => {
    const connectionId = 'my-sonarqube-connection';
    const mockSonarQubeConnections = [
      { connectionId: connectionId, serverUrl: 'https://sonarqube.example' }
    ];
    const mockSonarCloudConnections = [];

    getSonarQubeConnectionsStub.returns(mockSonarQubeConnections);
    getSonarCloudConnectionsStub.returns(mockSonarCloudConnections);
    showErrorMessageStub.resolves(undefined);

    await handleInvalidTokenNotification(connectionId);

    assert.isTrue(showErrorMessageStub.calledOnce);
    assert.isTrue(showErrorMessageStub.calledWith(
      `Connection to '${connectionId}' failed: Please verify your token.`,
      'Edit Connection'
    ));
    assert.isFalse(executeCommandStub.called);
  });

  test('should return early and not show error message when connectionId was not found', async () => {
    const connectionId = 'non-existent-connection';
    const mockSonarQubeConnections = [
      { connectionId: 'sonarqube-connection', serverUrl: 'https://sonarqube.example' }
    ];
    const mockSonarCloudConnections = [
      { connectionId: 'sonarcloud-connection', organizationKey: 'my-org' }
    ];

    getSonarQubeConnectionsStub.returns(mockSonarQubeConnections);
    getSonarCloudConnectionsStub.returns(mockSonarCloudConnections);

    await handleInvalidTokenNotification(connectionId);

    // Should return early without showing error message or executing commands
    assert.isFalse(showErrorMessageStub.called);
    assert.isFalse(executeCommandStub.called);
  });

  test('should handle empty connections lists correctly', async () => {
    const connectionId = 'my-connection';

    getSonarQubeConnectionsStub.returns([]);
    getSonarCloudConnectionsStub.returns([]);

    await handleInvalidTokenNotification(connectionId);

    // Should return early without showing error message
    assert.isFalse(showErrorMessageStub.called);
    assert.isFalse(executeCommandStub.called);
  });
});

function getSonarQubeConnections() {
  return vscode.workspace.getConfiguration('sonarlint').get('connectedMode.connections.sonarqube');
}

function getSonarCloudConnections() {
  return vscode.workspace.getConfiguration('sonarlint').get('connectedMode.connections.sonarcloud');
}
