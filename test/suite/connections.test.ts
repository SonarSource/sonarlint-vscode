/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { expect } from 'chai';
import { AllConnectionsTreeDataProvider, ConnectionGroup } from '../../src/connections';
import { beforeEach, describe } from 'mocha';
import { SonarLintExtendedLanguageClient } from '../../src/client';

const CONNECTED_MODE_SETTINGS = 'connectedMode.connections';
const CONNECTED_MODE_SETTINGS_SONARQUBE = 'connectedMode.connections.sonarqube';
const CONNECTED_MODE_SETTINGS_SONARCLOUD = 'connectedMode.connections.sonarcloud';

const mockClient = {
  async onReady() {
    return Promise.resolve();
  },
  async checkConnection(connectionId: string) {
    return Promise.resolve({ connectionId, success: true });
  }
} as SonarLintExtendedLanguageClient;

suite('Connected Mode Test Suite', () => {
  beforeEach(async () => {
    // start from scratch config
    await vscode.workspace.getConfiguration('sonarlint')
        .update(CONNECTED_MODE_SETTINGS_SONARQUBE, undefined, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('sonarlint')
        .update(CONNECTED_MODE_SETTINGS_SONARCLOUD, undefined, vscode.ConfigurationTarget.Global);
  });

  teardown(async () => {
    await vscode.workspace.getConfiguration('sonarlint')
        .update(CONNECTED_MODE_SETTINGS, undefined, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  describe('getConnections()', () => {
    let underTest;
    beforeEach(() => {
        underTest = new AllConnectionsTreeDataProvider(mockClient);
    });

    test('should return same number of sonarqube settings as in config file', async () => {
      const connectionConfig = vscode.workspace.getConfiguration('sonarlint.connectedMode.connections');
      expect(connectionConfig.sonarqube.length).to.equal((await underTest.getConnections('sonarqube')).length);
    });

    test('should return no sq/sc connections when config is blank', async () => {
      expect((await underTest.getConnections('sonarqube')).length).to.equal(0);
      expect((await underTest.getConnections('sonarcloud')).length).to.equal(0);
    });

    test('should return same number of sonarcloud settings as in config file', async () => {
      const connectionConfig = vscode.workspace.getConfiguration('sonarlint.connectedMode.connections');
      expect(connectionConfig.sonarcloud.length).to.equal((await underTest.getConnections('sonarcloud')).length);
    });

  });

  describe('ConnectedMode TreeView', () => {
    const SQGroup = new ConnectionGroup('sonarqube', 'SonarQube', 'sonarQubeGroup');
    const SCGroup = new ConnectionGroup('sonarcloud', 'SonarCloud', 'sonarCloudGroup');

    test('should return empty lists when expanding SQ and SC tabs and no connections exist', async () => {
      const underTest = new AllConnectionsTreeDataProvider(mockClient);

      const initialChildren = await underTest.getChildren(null);

      expect(initialChildren.length).to.equal(2);
      expect(initialChildren[0]).to.equal(null);
      expect(initialChildren[1]).to.equal(null);
    });

    test('should return singleton list when expanding SQ and one connection exists', async () => {
      const testSQConfig = [
        { serverUrl: 'https://sonarqube.mycompany.com', token: '<generated from SonarQube account/security page>' }
      ];
      await vscode.workspace.getConfiguration('sonarlint')
          .update(CONNECTED_MODE_SETTINGS_SONARQUBE, testSQConfig, vscode.ConfigurationTarget.Global);

      const underTest = new AllConnectionsTreeDataProvider(mockClient);

      const sonarQubeChildren = await underTest.getChildren(SQGroup);

      expect(sonarQubeChildren.length).to.equal(1);
      expect(sonarQubeChildren[0].label).to.equal(testSQConfig[0].serverUrl);
    });

    test('should return two element list when expanding SC and two connections exist', async () => {
      const testSCConfig = [
        { organizationKey: 'myOrg1', token: 'ggggg' },
        { organizationKey: 'myOrg2', token: 'ddddd' }
      ];
      await vscode.workspace.getConfiguration('sonarlint')
          .update(CONNECTED_MODE_SETTINGS_SONARCLOUD, testSCConfig, vscode.ConfigurationTarget.Global);

      const underTest = new AllConnectionsTreeDataProvider(mockClient);

      const sonarCloudChildren = await underTest.getChildren(SCGroup);

      expect(sonarCloudChildren.length).to.equal(2);
      expect(sonarCloudChildren[0].label).to.equal(testSCConfig[0].organizationKey);
      expect(sonarCloudChildren[1].label).to.equal(testSCConfig[1].organizationKey);
    });
  });
});
