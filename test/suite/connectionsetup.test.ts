/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { Commands } from '../../src/commands';
import { handleMessage } from '../../src/connectionsetup';

suite('Connection Setup', () => {

  setup(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  teardown(async () => {
    await vscode.workspace.getConfiguration('sonarlint')
        .update('connectedMode.connections.sonarqube', undefined, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('should show webview when command is called', async () => {
    const connectionsBefore = getSonarQubeConnections();
    assert.deepStrictEqual(connectionsBefore, []);

    await vscode.commands.executeCommand(Commands.CONNECT_TO_SONARQUBE);

    const serverUrl = 'https://sonarqube.example';
    const token = 'definitely not a valid token';

    await handleMessage({
      command: 'saveConnection',
      serverUrl,
      token
    });

    const connectionsAfter = getSonarQubeConnections();
    assert.deepStrictEqual(connectionsAfter, [{ serverUrl, token }]);
  });
});

function getSonarQubeConnections() {
  return vscode.workspace.getConfiguration('sonarlint').get('connectedMode.connections.sonarqube');
}
