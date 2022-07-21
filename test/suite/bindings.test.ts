/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import { describe, beforeEach } from 'mocha';
import { BindingService } from '../../src/binding';
import { ConnectionSettingsService } from '../../src/settings';

import * as VSCode from 'vscode';
import { SonarLintExtendedLanguageClient } from '../../src/client';

const CONNECTED_MODE_SETTINGS = 'connectedMode.connections';
const CONNECTED_MODE_SETTINGS_SONARQUBE = 'connectedMode.connections.sonarqube';
const SONARLINT_CATEGORY = 'sonarlint';
const BINDING_SETTINGS = 'connectedMode.project';

const connectionSettingsService = ConnectionSettingsService.instance;

const TEST_SONARQUBE_CONNECTION = {
  connectionId: 'test',
  serverUrl: 'https://test.sonarqube.com'
};

const TEST_BINDING = {
  connectionId: 'test',
  projectKey: 'test.project.key'
};

const TWO = 2;

const mockClient = {
  async onReady() {
    return Promise.resolve();
  },
  async getRemoteProjectsForConnection(_connectionId: string): Promise<Map<string, string>> {
    return new Map([
      ['key1', 'name1'],
      ['key2', 'name2']
    ]);
  },
  async checkConnection(connectionId: string) {
    return Promise.resolve({ connectionId, success: true });
  }
} as SonarLintExtendedLanguageClient;

suite('Bindings Test Suite', () => {
  beforeEach(async () => {
    // start from 1 SQ connection config
    await VSCode.workspace
      .getConfiguration(SONARLINT_CATEGORY)
      .update(CONNECTED_MODE_SETTINGS_SONARQUBE, [TEST_SONARQUBE_CONNECTION], VSCode.ConfigurationTarget.Global);

    // remove all existing bindings
    VSCode.workspace.workspaceFolders.forEach(async folder => {
      await VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, folder.uri)
        .update(BINDING_SETTINGS, undefined, VSCode.ConfigurationTarget.Global);
    });
  });

  teardown(async () => {
    await VSCode.workspace
      .getConfiguration(SONARLINT_CATEGORY)
      .update(CONNECTED_MODE_SETTINGS, undefined, VSCode.ConfigurationTarget.Global);
    VSCode.workspace.workspaceFolders.forEach(async folder => {
      await VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, folder.uri)
        .update(BINDING_SETTINGS, undefined, VSCode.ConfigurationTarget.Global);
    });
    await VSCode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  describe('Bindings Manager', () => {
    let underTest;
    beforeEach(() => {
      underTest = new BindingService(mockClient, connectionSettingsService);
    });

    test('Save binding updates configuration', async () => {
      const workspaceFolder = VSCode.workspace.workspaceFolders[0];
      let updatedBinding;

      const existingBinding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get(BINDING_SETTINGS);
      expect(existingBinding).to.be.empty;

      underTest.saveBinding(TEST_BINDING.projectKey, TEST_BINDING.connectionId, workspaceFolder).then(_a => {
        updatedBinding = VSCode.workspace
          .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
          .get(BINDING_SETTINGS);
        expect(updatedBinding.connectionId).to.equal(TEST_BINDING.connectionId);
        expect(updatedBinding.projectKey).to.equal(TEST_BINDING.projectKey);
      });
    });

    test('Get remote projects items correctly maps keys and names', async () => {
      const items = await underTest.getRemoteProjectsItems(TEST_SONARQUBE_CONNECTION.connectionId);
      const remoteProjects = await mockClient.getRemoteProjectsForConnection(TEST_SONARQUBE_CONNECTION.connectionId);

      const remoteProjectNames = remoteProjects.values();
      const remoteProjectKeys = remoteProjects.keys();

      expect(items.length).to.equal(TWO);
      expect(items[0].label).to.equal(remoteProjectNames.next().value);
      expect(items[0].description).to.equal(remoteProjectKeys.next().value);
      expect(items[1].label).to.equal(remoteProjectNames.next().value);
      expect(items[1].description).to.equal(remoteProjectKeys.next().value);
    });

    test('Folder selection QuickPick should directly return folder name when only 1 folder in WS', async () => {
      const workspaceFolders = VSCode.workspace.workspaceFolders;
      expect(workspaceFolders.length).to.equal(1);

      const defaultSelection = await underTest.showFolderSelectionQuickPickOrReturnDefaultSelection(workspaceFolders);
      expect(defaultSelection).to.equal(workspaceFolders[0].name);
    });
  });
});
