/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { expect } from 'chai';
import { AllConnectionsTreeDataProvider, ConnectionGroup } from '../../src/connected/connections';
import { SonarLintExtendedLanguageClient } from '../../src/lsp/client';
import * as path from 'path';
import { sampleFolderLocation } from './commons';
import { ThemeIcon } from 'vscode';
import { ConnectionSettingsService } from '../../src/settings/connectionsettings';

const CONNECTED_MODE_SETTINGS = 'connectedMode.connections';
const CONNECTED_MODE_SETTINGS_SONARQUBE = 'connectedMode.connections.sonarqube';
const CONNECTED_MODE_SETTINGS_SONARCLOUD = 'connectedMode.connections.sonarcloud';

const sampleFolderUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation));

const projectKeysToNames = {
  projectKey1: 'Project Name 1',
  projectKey2: 'Project Name 2'
} as { [k: string]: string };

const mockClient = {
  async checkConnection(connectionId: string) {
    return Promise.resolve({ connectionId, success: true });
  },
  async getRemoteProjectNames(_connectionId, _projectKeys) {
    return Promise.resolve(projectKeysToNames);
  }
} as SonarLintExtendedLanguageClient;

suite('Connected Mode Test Suite', () => {
  setup(async () => {
    // start from scratch config
    await vscode.workspace
      .getConfiguration('sonarlint')
      .update(CONNECTED_MODE_SETTINGS_SONARQUBE, undefined, vscode.ConfigurationTarget.Global);
    await vscode.workspace
      .getConfiguration('sonarlint')
      .update(CONNECTED_MODE_SETTINGS_SONARCLOUD, undefined, vscode.ConfigurationTarget.Global);
  });

  teardown(async () => {
    await vscode.workspace
      .getConfiguration('sonarlint')
      .update(CONNECTED_MODE_SETTINGS, undefined, vscode.ConfigurationTarget.Global);
    await vscode.workspace
      .getConfiguration('sonarlint', sampleFolderUri)
      .update('connectedMode.project', undefined, vscode.ConfigurationTarget.WorkspaceFolder);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  suite('getConnections()', () => {
    let underTest;
    setup(() => {
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

  suite('ConnectedMode TreeView', () => {
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
      await vscode.workspace
        .getConfiguration('sonarlint')
        .update(CONNECTED_MODE_SETTINGS_SONARQUBE, testSQConfig, vscode.ConfigurationTarget.Global);
      await vscode.workspace
        .getConfiguration('sonarlint', sampleFolderUri)
        .update('connectedMode.project', { projectKey: 'projectKey1' }, vscode.ConfigurationTarget.WorkspaceFolder);

      const underTest = new AllConnectionsTreeDataProvider(mockClient);
      ConnectionSettingsService.instance.reportConnectionCheckResult({
        connectionId: '<default>',
        success: false,
        reason: 'unknown'
      });

      const sonarQubeChildren = await underTest.getChildren(SQGroup);

      expect(sonarQubeChildren.length).to.equal(1);
      const connectionNode = sonarQubeChildren[0];
      expect(connectionNode.label).to.equal(testSQConfig[0].serverUrl);
      expect((connectionNode.iconPath as ThemeIcon).id).to.equal('circle-large-outline');

      const connectionChildren = await underTest.getChildren(connectionNode);
      expect(connectionChildren.length).to.equal(1);
      const remoteProjectNode = connectionChildren[0];
      expect(remoteProjectNode.label).to.equal('Project Name 1');
      expect(remoteProjectNode.description).to.equal('projectKey1');

      const remoteProjectChildren = await underTest.getChildren(remoteProjectNode);
      expect(remoteProjectChildren.length).to.equal(1);
      const workspaceFolderNode = remoteProjectChildren[0];
      expect(workspaceFolderNode.label).to.equal('samples');
    });

    test('should return two element list when expanding SC and two connections exist', async () => {
      const testSCConfig = [
        { organizationKey: 'myOrg1', token: 'ggggg' },
        { organizationKey: 'myOrg2', token: 'ddddd' }
      ];
      await vscode.workspace
        .getConfiguration('sonarlint')
        .update(CONNECTED_MODE_SETTINGS_SONARCLOUD, testSCConfig, vscode.ConfigurationTarget.Global);

      const underTest = new AllConnectionsTreeDataProvider(mockClient);

      const sonarCloudChildren = await underTest.getChildren(SCGroup);

      expect(sonarCloudChildren.length).to.equal(2);
      expect(sonarCloudChildren[0].label).to.equal(testSCConfig[0].organizationKey);
      expect(sonarCloudChildren[1].label).to.equal(testSCConfig[1].organizationKey);
    });

    test('should return two element list with proper icons when expanding SC and two connections exist', async () => {
      const testSCConfig = [
        { connectionId: 'one', organizationKey: 'myOrg1', token: 'ggggg' },
        { connectionId: 'two', organizationKey: 'myOrg2', token: 'ddddd' }
      ];
      await vscode.workspace
        .getConfiguration('sonarlint')
        .update(CONNECTED_MODE_SETTINGS_SONARCLOUD, testSCConfig, vscode.ConfigurationTarget.Global);

      const underTest = new AllConnectionsTreeDataProvider(mockClient);

      ConnectionSettingsService.instance.reportConnectionCheckResult({
        connectionId: 'one',
        success: true,
        reason: null
      });
      ConnectionSettingsService.instance.reportConnectionCheckResult({
        connectionId: 'two',
        success: false,
        reason: 'Authentication failed'
      });
      const sonarCloudChildren = await underTest.getChildren(SCGroup);

      expect(sonarCloudChildren.length).to.equal(2);
      expect(sonarCloudChildren[0].label).to.equal(testSCConfig[0].connectionId);
      expect((sonarCloudChildren[0].iconPath as ThemeIcon).id).to.equal('pass');
      expect(sonarCloudChildren[1].label).to.equal(testSCConfig[1].connectionId);
      expect((sonarCloudChildren[1].iconPath as ThemeIcon).id).to.equal('error');
    });
  });
});
