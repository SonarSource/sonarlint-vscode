/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as vscode from 'vscode';
import { expect } from 'chai';
import * as sinon from 'sinon';
import {
  AllConnectionsTreeDataProvider,
  ConnectionGroup,
  ConnectionsNode,
  ServerType,
  UnresolvedBindingItem,
  UnresolvedBindingsGroup
} from '../../src/connected/connections';
import { SonarLintExtendedLanguageClient } from '../../src/lsp/client';
import * as path from 'path';
import { sampleFolderLocation, SETUP_TEARDOWN_HOOK_TIMEOUT } from './commons';
import { ThemeIcon } from 'vscode';
import { ConnectionSettingsService } from '../../src/settings/connectionsettings';
import { BindingService } from '../../src/connected/binding';

const CONNECTED_MODE_SETTINGS = 'connectedMode.connections';
const CONNECTED_MODE_SETTINGS_SONARQUBE = 'connectedMode.connections.sonarqube';
const CONNECTED_MODE_SETTINGS_SONARCLOUD = 'connectedMode.connections.sonarcloud';

const sampleFolderUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation, 'sample-for-bindings'));

const projectKeysToNames = {
  projectKey1: 'Project Name 1',
  projectKey2: 'Project Name 2'
} as { [k: string]: string };

const mockClient = {
  async checkConnection(connectionId: string) {
    return { connectionId, success: true };
  },
  async getRemoteProjectNamesByKeys(_connectionId, _projectKeys) {
    return projectKeysToNames;
  }
} as SonarLintExtendedLanguageClient;

const nextTick = () => new Promise(resolve => setTimeout(resolve, 0));

async function childrenOnceTheNamesAreLoaded(provider: AllConnectionsTreeDataProvider, node: ConnectionsNode) {
  await provider.getChildren(node);
  await nextTick();
  return provider.getChildren(node);
}

async function waitForBindingToReachTheLanguageServer(projectKey: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (BindingService.instance.getBoundProjectKeys(undefined).includes(projectKey)) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

suite('Connected Mode Test Suite', () => {
  setup(async function () {
    this.timeout(SETUP_TEARDOWN_HOOK_TIMEOUT);
    // start from scratch config
    await vscode.workspace
      .getConfiguration('sonarlint')
      .update(CONNECTED_MODE_SETTINGS_SONARQUBE, undefined, vscode.ConfigurationTarget.Global);
    await vscode.workspace
      .getConfiguration('sonarlint')
      .update(CONNECTED_MODE_SETTINGS_SONARCLOUD, undefined, vscode.ConfigurationTarget.Global);
  });

  teardown(async function () {
    this.timeout(SETUP_TEARDOWN_HOOK_TIMEOUT);
    await vscode.workspace
      .getConfiguration('sonarlint')
      .update(CONNECTED_MODE_SETTINGS, undefined, vscode.ConfigurationTarget.Global);
    await vscode.workspace
      .getConfiguration('sonarlint', sampleFolderUri)
      .update('connectedMode.project', undefined, vscode.ConfigurationTarget.WorkspaceFolder);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  suite('getConnections()', () => {
    let underTest: AllConnectionsTreeDataProvider;
    setup(function () {
      this.timeout(SETUP_TEARDOWN_HOOK_TIMEOUT);
      underTest = new AllConnectionsTreeDataProvider(mockClient);
    });

    test('should return same number of sonarqube settings as in config file', async () => {
      const connectionConfig = vscode.workspace.getConfiguration('sonarlint.connectedMode.connections');
      expect(connectionConfig.sonarqube.length).to.equal((await underTest.getConnections('__sonarqube__')).length);
    });

    test('should return no sq/sc connections when config is blank', async () => {
      expect((await underTest.getConnections('__sonarqube__')).length).to.equal(0);
      expect((await underTest.getConnections('__sonarcloud__')).length).to.equal(0);
    });

    test('should return same number of sonarcloud settings as in config file', async () => {
      const connectionConfig = vscode.workspace.getConfiguration('sonarlint.connectedMode.connections');
      expect(connectionConfig.sonarcloud.length).to.equal((await underTest.getConnections('__sonarcloud__')).length);
    });
  });

  suite('Names of the bound projects', () => {
    const connectionId = 'connection';
    let boundProjectKeys: sinon.SinonStub;

    setup(() => {
      boundProjectKeys = sinon.stub(BindingService.instance, 'getBoundProjectKeys').returns(['projectKey1', 'projectKey2']);
    });

    teardown(() => {
      boundProjectKeys.restore();
    });

    function clientAnswering(answer: () => Promise<{ [k: string]: string }>) {
      const requests: string[][] = [];
      const client = {
        getRemoteProjectNamesByKeys: (_connectionId: string, keys: string[]) => {
          requests.push(keys);
          return answer();
        }
      } as unknown as SonarLintExtendedLanguageClient;
      return { client, requests };
    }

    test('should show the projects at once, by key, while their names are loaded', async () => {
      let answerWith: (names: { [k: string]: string }) => void;
      const { client } = clientAnswering(() => new Promise(resolve => (answerWith = resolve)));
      const underTest = new AllConnectionsTreeDataProvider(client);

      const projects = underTest.getBoundProjects(connectionId, ServerType.SonarCloud);

      expect(projects.map(p => p.label)).to.deep.equal(['projectKey1', 'projectKey2']);
      expect((projects[0].iconPath as ThemeIcon).id).to.equal('loading~spin');
      answerWith(projectKeysToNames);
    });

    test('should refresh the tree and show the names once they are loaded', async () => {
      const { client } = clientAnswering(async () => projectKeysToNames);
      const underTest = new AllConnectionsTreeDataProvider(client);
      let refreshed = 0;
      underTest.onDidChangeTreeData(() => refreshed++);

      underTest.getBoundProjects(connectionId, ServerType.SonarCloud);
      await nextTick();

      expect(refreshed).to.equal(1);
      const projects = underTest.getBoundProjects(connectionId, ServerType.SonarCloud);
      expect(projects.map(p => p.label)).to.deep.equal(['Project Name 1', 'Project Name 2']);
      expect((projects[0].iconPath as ThemeIcon).id).to.equal('cloud');
    });

    test('should ask for the names only once, however often the tree is drawn', async () => {
      const { client, requests } = clientAnswering(async () => projectKeysToNames);
      const underTest = new AllConnectionsTreeDataProvider(client);

      underTest.getBoundProjects(connectionId, ServerType.SonarCloud);
      underTest.getBoundProjects(connectionId, ServerType.SonarCloud);
      await nextTick();
      underTest.getBoundProjects(connectionId, ServerType.SonarCloud);
      await nextTick();

      expect(requests).to.deep.equal([['projectKey1', 'projectKey2']]);
    });

    test('should only ask for the names it does not know yet', async () => {
      const { client, requests } = clientAnswering(async () => projectKeysToNames);
      const underTest = new AllConnectionsTreeDataProvider(client);
      underTest.getBoundProjects(connectionId, ServerType.SonarCloud);
      await nextTick();
      boundProjectKeys.returns(['projectKey1', 'projectKey2', 'projectKey3']);

      underTest.getBoundProjects(connectionId, ServerType.SonarCloud);
      await nextTick();

      expect(requests).to.deep.equal([['projectKey1', 'projectKey2'], ['projectKey3']]);
    });

    test('should say that a project is not found when the server does not know it', async () => {
      const { client } = clientAnswering(async () => ({ projectKey1: 'Project Name 1' }));
      const underTest = new AllConnectionsTreeDataProvider(client);
      underTest.getBoundProjects(connectionId, ServerType.SonarCloud);
      await nextTick();

      const projects = underTest.getBoundProjects(connectionId, ServerType.SonarCloud);

      expect(projects.map(p => p.label)).to.deep.equal(['Project Name 1', '<project not found>']);
    });

    test('should mark the projects whose names could not be loaded, without asking again by itself', async () => {
      const { client, requests } = clientAnswering(() => Promise.reject(new Error('offline')));
      const underTest = new AllConnectionsTreeDataProvider(client);

      underTest.getBoundProjects(connectionId, ServerType.SonarCloud);
      await nextTick();
      const projects = underTest.getBoundProjects(connectionId, ServerType.SonarCloud);
      await nextTick();

      expect(projects.map(p => p.label)).to.deep.equal(['projectKey1', 'projectKey2']);
      expect((projects[0].iconPath as ThemeIcon).id).to.equal('question');
      expect(requests).to.have.length(1);
    });
  });

  suite('Bindings without connection', () => {
    test('should say what the group is about, since it replaces the welcome content', () => {
      const group = new UnresolvedBindingsGroup();

      expect(group.label).to.equal('Needs attention');
      expect(group.description).to.equal('no matching connection');
      expect(group.tooltip).to.contain('not bound').and.to.contain('create the missing connection');
      expect(group.contextValue).to.equal('unresolvedBindingsGroup');
    });

    const unresolvedBinding = {
      scopeUri: 'file:///repo/moduleB/',
      name: 'moduleB',
      relativePath: 'moduleB',
      projectKey: 'module-b',
      source: 'SONAR_CONFIG' as const,
      status: 'MISSING_CONNECTION' as const
    };

    test('should offer to create a SonarQube Server connection for a config naming a server', () => {
      expect(new UnresolvedBindingItem({ ...unresolvedBinding, serverUrl: 'http://unknown' }).contextValue).to.equal(
        'unresolvedBindingServer'
      );
    });

    test('should offer to create a SonarQube Cloud connection for a config naming an organization', () => {
      expect(new UnresolvedBindingItem({ ...unresolvedBinding, organization: 'my-org', region: 'EU' }).contextValue).to.equal(
        'unresolvedBindingCloud'
      );
    });

    test('should offer both when only the connection id of the folder settings is known', () => {
      expect(new UnresolvedBindingItem({ ...unresolvedBinding, source: 'SETTINGS', connectionId: 'my-connection' }).contextValue).to.equal(
        'unresolvedBindingUnknown'
      );
    });

    test('should show the folder with what it is declared bound to', () => {
      const item = new UnresolvedBindingItem({
        scopeUri: 'file:///repo/moduleB/',
        name: 'moduleB',
        relativePath: 'moduleB',
        projectKey: 'module-b',
        source: 'SONAR_CONFIG',
        status: 'MISSING_CONNECTION',
        serverUrl: 'http://unknown'
      });

      expect(item.label).to.equal('moduleB');
      expect(item.description).to.equal('module-b, no connection for SonarQube Server http://unknown');
      expect((item.iconPath as ThemeIcon).id).to.equal('warning');
    });
  });

  suite('ConnectedMode TreeView', () => {
    const SQGroup = new ConnectionGroup('__sonarqube__', 'SonarQube Server', 'sonarQubeGroup');
    const SCGroup = new ConnectionGroup('__sonarcloud__', 'SonarQube Cloud', 'sonarCloudGroup');

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

      await waitForBindingToReachTheLanguageServer('projectKey1');
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

      const connectionChildren = await childrenOnceTheNamesAreLoaded(underTest, connectionNode);
      expect(connectionChildren.length).to.equal(1);
      const remoteProjectNode = connectionChildren[0];
      expect(remoteProjectNode.label).to.equal('Project Name 1');
      expect(remoteProjectNode.description).to.equal('projectKey1');

      const remoteProjectChildren = await underTest.getChildren(remoteProjectNode);
      expect(remoteProjectChildren.length).to.equal(1);
      const workspaceFolderNode = remoteProjectChildren[0];
      expect(workspaceFolderNode.label).to.equal('sample-for-bindings');
    });

    test('should include regions when expanding SC and two connections exist', async () => {
      const testSCConfig = [
        { organizationKey: 'myOrg1', token: 'ggggg', region: 'EU' },
        { organizationKey: 'myOrg2', token: 'ddddd', region: 'US' }
      ];
      await vscode.workspace
        .getConfiguration('sonarlint')
        .update(CONNECTED_MODE_SETTINGS_SONARCLOUD, testSCConfig, vscode.ConfigurationTarget.Global);

      const underTest = new AllConnectionsTreeDataProvider(mockClient);

      const sonarCloudChildren = await underTest.getChildren(SCGroup);

      expect(sonarCloudChildren.length).to.equal(2);
      expect(sonarCloudChildren[0].label).to.equal('[EU] ' + testSCConfig[0].organizationKey);
      expect(sonarCloudChildren[1].label).to.equal('[US] ' + testSCConfig[1].organizationKey);
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
      expect(sonarCloudChildren[0].label).to.equal('[EU] ' + testSCConfig[0].connectionId);
      expect((sonarCloudChildren[0].iconPath as ThemeIcon).id).to.equal('pass');
      expect(sonarCloudChildren[1].label).to.equal('[EU] ' + testSCConfig[1].connectionId);
      expect((sonarCloudChildren[1].iconPath as ThemeIcon).id).to.equal('error');
    });
  });
});
