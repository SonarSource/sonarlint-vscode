/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import { BindingService, ProjectBinding } from '../../src/binding';
import { ConnectionSettingsService, SonarQubeConnection } from '../../src/settings';

import * as VSCode from 'vscode';
import { SonarLintExtendedLanguageClient } from '../../src/client';
import { Connection, WorkspaceFolderItem } from '../../src/connections';

const CONNECTED_MODE_SETTINGS = 'connectedMode.connections';
const CONNECTED_MODE_SETTINGS_SONARQUBE = 'connectedMode.connections.sonarqube';
const SONARLINT_CATEGORY = 'sonarlint';
const BINDING_SETTINGS = 'connectedMode.project';

const connectionSettingsService = ConnectionSettingsService.instance;

const TEST_SONARQUBE_CONNECTION = {
  connectionId: 'test',
  serverUrl: 'https://test.sonarqube.com'
};

const DEFAULT_TEST_SONARQUBE_CONNECTION = {
  serverUrl: 'https://test.sonarqube.com'
};

const TEST_BINDING = {
  connectionId: 'test',
  projectKey: 'test.project.key'
};

const DEFAULT_TEST_BINDING = {
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

const mockSettingsService = {
  async loadSonarQubeConnection(connectionId: string): Promise<SonarQubeConnection> {
    return { serverUrl: "https://next.sonarqube.com/sonarqube", connectionId: connectionId };
  }
} as ConnectionSettingsService;

async function resetBindings() {
  return Promise.all(VSCode.workspace.workspaceFolders.map(folder => {
    return VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, folder.uri)
      .update(BINDING_SETTINGS, undefined, VSCode.ConfigurationTarget.WorkspaceFolder);
  }));
}

suite('Bindings Test Suite', () => {
  setup(async () => {
    // start from 1 SQ connection config
    await VSCode.workspace
      .getConfiguration(SONARLINT_CATEGORY)
      .update(CONNECTED_MODE_SETTINGS_SONARQUBE, [TEST_SONARQUBE_CONNECTION], VSCode.ConfigurationTarget.Global);

    await resetBindings();
  });

  teardown(async () => {
    await resetBindings();
    await VSCode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  suite('Bindings Manager', () => {
    let underTest;
    setup(() => {
      underTest = new BindingService(mockClient, mockSettingsService);
    });

    test('Save binding updates configuration', async () => {
      const workspaceFolder = VSCode.workspace.workspaceFolders[0];

      const existingBinding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get(BINDING_SETTINGS);
      expect(existingBinding).to.be.empty;

      await underTest.saveBinding(TEST_BINDING.projectKey, TEST_BINDING.connectionId, workspaceFolder);

      const updatedBinding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get<ProjectBinding>(BINDING_SETTINGS);
      expect(updatedBinding).to.deep.equal(TEST_BINDING);

      await underTest.deleteBinding(new WorkspaceFolderItem('name', workspaceFolder, TEST_BINDING.connectionId, 'SonarQube'));

      const deletedBinding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get(BINDING_SETTINGS);
      expect(deletedBinding).to.be.empty;
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

    test('Delete bindings for connection', async () => {
      const workspaceFolder = VSCode.workspace.workspaceFolders[0];

      let binding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get(BINDING_SETTINGS);
      expect(binding).to.be.empty;

      await underTest.saveBinding(TEST_BINDING.projectKey, TEST_BINDING.connectionId, workspaceFolder);

      binding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get<ProjectBinding>(BINDING_SETTINGS);
      expect(binding).to.deep.equal(TEST_BINDING);

      await underTest.deleteBindingsForConnection(new Connection(TEST_SONARQUBE_CONNECTION.connectionId,
        TEST_SONARQUBE_CONNECTION.connectionId, 'sonarqubeConnection', 'ok'));

      binding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get<ProjectBinding>(BINDING_SETTINGS);
      expect(binding).to.be.empty;
    });

    test('Default connection ID to <default> if not provided during deletion', async () => {
      await VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY)
        .update(CONNECTED_MODE_SETTINGS_SONARQUBE, [DEFAULT_TEST_SONARQUBE_CONNECTION], VSCode.ConfigurationTarget.Global);
      await resetBindings();

      const workspaceFolder = VSCode.workspace.workspaceFolders[0];

      let binding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get(BINDING_SETTINGS);
      expect(binding).to.be.empty;

      await underTest.saveBinding(DEFAULT_TEST_BINDING.projectKey, '<default>', workspaceFolder);

      binding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get<ProjectBinding>(BINDING_SETTINGS);
      expect(binding).to.deep.equal({
          "connectionId": "<default>",
          "projectKey": "test.project.key"
        }
      );

      await underTest.deleteBindingsForConnection(new Connection(undefined,
        TEST_SONARQUBE_CONNECTION.connectionId, 'sonarqubeConnection', 'ok'));

      const defaultConnectionBindings = await underTest.getAllBindings().get('<default>');
      expect(defaultConnectionBindings).to.be.equal(undefined);
    });

    test('Create Or Edit Binding', async () => {
      const workspaceFolder = VSCode.workspace.workspaceFolders[0];

      let binding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get(BINDING_SETTINGS);
      expect(binding).to.be.empty;
      await underTest.createOrEditBinding(TEST_BINDING.connectionId, 'contextValue', workspaceFolder, 'SonarQube');
      // Wait quick pick list to display
      await sleep(100);
      await VSCode.commands.executeCommand('workbench.action.quickOpenNavigateNext');
      // Wait for the selection to happen
      await sleep(100);
      await VSCode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
      // Wait settings to save
      await sleep(500);

      binding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get<ProjectBinding>(BINDING_SETTINGS);
      expect(binding).to.deep.equal({
          "connectionId": TEST_BINDING.connectionId,
          "projectKey": "key2"
        }
      );
    });
  });
});

function sleep(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}
