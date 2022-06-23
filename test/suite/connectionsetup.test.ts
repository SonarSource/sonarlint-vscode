/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { sleep } from '../testutil';
import { Commands } from '../../src/commands';
import { handleMessage } from '../../src/connectionsetup';
import { ConnectionSettingsService } from '../../src/settings';

suite('Connection Setup', () => {

  setup(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  teardown(async () => {
    await vscode.workspace.getConfiguration('sonarlint')
        .update('connectedMode.connections.sonarqube', undefined, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('should show creation webview when command is called', async () => {
    const sleepTime = 1000;
    const connectionsBefore = getSonarQubeConnections();
    assert.deepStrictEqual(connectionsBefore, []);

    await vscode.commands.executeCommand(Commands.CONNECT_TO_SONARQUBE);
    await sleep(sleepTime);

    const serverUrl = 'https://sonarqube.example';
    const token = 'definitely not a valid token';
    const disableNotifications = false;

    await handleMessage({
      command: 'saveConnection',
      serverUrl,
      token,
      disableNotifications
    });
    await sleep(sleepTime);

    const connectionsAfter = getSonarQubeConnections();
    assert.deepStrictEqual(connectionsAfter, [{ serverUrl }]);
  }).timeout(5000);

  test('should edit default connection when command is called', async () => {
    const sleepTime = 1000;
    const connectionsBefore = getSonarQubeConnections();
    assert.deepStrictEqual(connectionsBefore, []);

    const serverUrl = 'https://notsonarqube.example';
    const token = 'XXX SUPER SECRET TOKEN XXX';

    await ConnectionSettingsService.getInstance.addSonarQubeConnection({
      serverUrl,
      token
    });

    await sleep(sleepTime);

    await vscode.commands.executeCommand(Commands.EDIT_SONARQUBE_CONNECTION, Promise.resolve({ id: undefined }));
    await sleep(sleepTime);

    const disableNotifications = true;

    await handleMessage({
      command: 'saveConnection',
      serverUrl,
      token,
      disableNotifications
    });
    await sleep(sleepTime);

    const connectionsAfter = getSonarQubeConnections();
    assert.deepStrictEqual(connectionsAfter, [{ serverUrl, disableNotifications }]);
  }).timeout(5000);

  test('should edit identified connection when command is called', async () => {
    const sleepTime = 1000;
    const connectionsBefore = getSonarQubeConnections();
    assert.deepStrictEqual(connectionsBefore, []);

    const serverUrl = 'https://stillnotsonarqube.example';
    const token = 'XXX SUPER SECRET TOKEN XXX';
    const connectionId = 'My Little SonarQube';

    await ConnectionSettingsService.getInstance.addSonarQubeConnection(
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

    await handleMessage({
      command: 'saveConnection',
      connectionId,
      serverUrl,
      token,
      disableNotifications
    });
    await sleep(sleepTime);

    const connectionsAfter = getSonarQubeConnections();
    assert.deepStrictEqual(connectionsAfter, [{ connectionId, serverUrl, disableNotifications }]);
  }).timeout(5000);

});

function getSonarQubeConnections() {
  return vscode.workspace.getConfiguration('sonarlint').get('connectedMode.connections.sonarqube');
}
