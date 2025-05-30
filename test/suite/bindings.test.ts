/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import { BindingService, ProjectBinding } from '../../src/connected/binding';
import {
  ConnectionSettingsService,
  SonarCloudConnection,
  SonarQubeConnection
} from '../../src/settings/connectionsettings';

import * as VSCode from 'vscode';
import { SonarLintExtendedLanguageClient } from '../../src/lsp/client';
import { Connection, WorkspaceFolderItem } from '../../src/connected/connections';
import * as protocol from '../../src/lsp/protocol';
import { DEFAULT_CONNECTION_ID } from '../../src/commons';
import { sleep } from '../testutil';
import { SharedConnectedModeSettingsService } from '../../src/connected/sharedConnectedModeSettingsService';
import { selectFirstQuickPickItem } from './commons';

const CONNECTED_MODE_SETTINGS_SONARQUBE = 'connectedMode.connections.sonarqube';
const SONARLINT_CATEGORY = 'sonarlint';
const BINDING_SETTINGS = 'connectedMode.project';

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
  async getRemoteProjectsForConnection(_connectionId: string): Promise<Object> {
    return { projectKey1: 'projectName1', projectKey2: 'projectName2' };
  },
  async checkConnection(connectionId: string) {
    return Promise.resolve({ connectionId, success: true });
  },
  async getSuggestedBinding(configScopeId:string, connectionId: string):Promise<protocol.SuggestBindingParams> {
    return Promise.resolve({suggestions:{}});
  },
  async didCreateBinding(mode) {
    return Promise.resolve();
  }
} as SonarLintExtendedLanguageClient;

const mockSettingsService = {
  async loadSonarQubeConnection(connectionId: string): Promise<SonarQubeConnection> {
    return { serverUrl: 'https://next.sonarqube.com/sonarqube', connectionId };
  },
  async loadSonarCloudConnection(connectionId: string): Promise<SonarCloudConnection> {
    return { organizationKey: 'orgKey', connectionId };
  },
  getStatusForConnection: (connectionId: string): protocol.ConnectionCheckResult => {
    console.log('Checking connection', connectionId)
    if (connectionId === 'test') {
      return { connectionId, success: true };
    } else {
      return { connectionId, success: false };
    }
  }
} as ConnectionSettingsService;


async function resetBindings() {
  return VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, VSCode.workspace.workspaceFolders[0].uri)
        .update(BINDING_SETTINGS, undefined, VSCode.ConfigurationTarget.WorkspaceFolder);
}

const mockWorkspaceState = {
  state: {
    doNotAskAboutAutoBindingForFolder: [],
    doNotAskAboutAutoBindingForWorkspace: false
  },
  keys: () => [],
  get(identifier: string) {
    return this.state[identifier];
  },
  async update(_identifier: string, newState: boolean) {
    this.state = newState;
  }
};

const sharedConnectedModeSettingsService = {} as SharedConnectedModeSettingsService;

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

  suiteTeardown('Cleanup SQ connections', async function() {
    await VSCode.workspace
      .getConfiguration(SONARLINT_CATEGORY)
      .update(CONNECTED_MODE_SETTINGS_SONARQUBE, undefined, VSCode.ConfigurationTarget.Global);
  });

  suite('Bindings Manager', () => {
    let underTest;
    setup(() => {
      underTest = new BindingService(mockClient, mockWorkspaceState, mockSettingsService, sharedConnectedModeSettingsService);
    });

    test('Save binding updates configuration', async () => {
      const workspaceFolder = VSCode.workspace.workspaceFolders[0];

      const existingBinding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get(BINDING_SETTINGS);
      expect(existingBinding).to.be.empty;

      await underTest.saveBinding(TEST_BINDING.projectKey, workspaceFolder, false, TEST_BINDING.connectionId);

      const updatedBinding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get<ProjectBinding>(BINDING_SETTINGS);
      expect(updatedBinding).to.deep.equal(TEST_BINDING);

      await underTest.deleteBinding(
        new WorkspaceFolderItem('name', workspaceFolder, TEST_BINDING.connectionId, 'SonarQube')
      );

      const deletedBinding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get(BINDING_SETTINGS);
      expect(deletedBinding).to.be.empty;
    }).timeout(5_000);

    test('Get remote projects items correctly maps keys and names', async () => {
      const items = await underTest.getRemoteProjectsItems(TEST_SONARQUBE_CONNECTION.connectionId);
      const remoteProjects = await mockClient.getRemoteProjectsForConnection(TEST_SONARQUBE_CONNECTION.connectionId);

      const remoteProjectNames = Object.values(remoteProjects);
      const remoteProjectKeys = Object.keys(remoteProjects);

      expect(items.length).to.equal(TWO);
      expect(items[0].label).to.equal(remoteProjectNames[0]);
      expect(items[0].description).to.equal(remoteProjectKeys[0]);
      expect(items[1].label).to.equal(remoteProjectNames[1]);
      expect(items[1].description).to.equal(remoteProjectKeys[1]);
    });

    test('Folder selection QuickPick should allow to choose a folder', async () => {
      const workspaceFolders = VSCode.workspace.workspaceFolders;
      expect(workspaceFolders.length).to.equal(4);

      let selectedFolder = '';
      underTest.showFolderSelectionQuickPickOrReturnDefaultSelection(workspaceFolders).then(selection => {
        selectedFolder = selection;
      });

      await selectFirstQuickPickItem();

      expect(selectedFolder).to.equal(workspaceFolders[0].name);
    }).timeout(5_000);

    test('Delete bindings for connection', async () => {
      const workspaceFolder = VSCode.workspace.workspaceFolders[0];

      let binding = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri).get(BINDING_SETTINGS);
      expect(binding).to.be.empty;

      await underTest.saveBinding(TEST_BINDING.projectKey, workspaceFolder, false, TEST_BINDING.connectionId);

      binding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get<ProjectBinding>(BINDING_SETTINGS);
      expect(binding).to.deep.equal(TEST_BINDING);

      await underTest.deleteBindingsForConnection(
        new Connection(
          TEST_SONARQUBE_CONNECTION.connectionId,
          TEST_SONARQUBE_CONNECTION.connectionId,
          'sonarqubeConnection',
          'ok'
        )
      );

      binding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get<ProjectBinding>(BINDING_SETTINGS);
      expect(binding).to.be.empty;
    });

    test('Delete bindings for deleted connection', async () => {
      const workspaceFolder = VSCode.workspace.workspaceFolders[0];

      let binding = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri).get(BINDING_SETTINGS);
      expect(binding).to.be.empty;

      await underTest.saveBinding(TEST_BINDING.projectKey, workspaceFolder, false, TEST_BINDING.connectionId);

      binding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get<ProjectBinding>(BINDING_SETTINGS);
      expect(binding).to.deep.equal(TEST_BINDING);

      await underTest.removeBindingsForRemovedConnections([TEST_BINDING.connectionId]);

      binding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get<ProjectBinding>(BINDING_SETTINGS);
      expect(binding).to.be.empty;
    })

    test('Default connection ID to <default> if not provided during deletion', async () => {
      await VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY)
        .update(
          CONNECTED_MODE_SETTINGS_SONARQUBE,
          [DEFAULT_TEST_SONARQUBE_CONNECTION],
          VSCode.ConfigurationTarget.Global
        );
      await resetBindings();

      const workspaceFolder = VSCode.workspace.workspaceFolders[0];

      let binding = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri).get(BINDING_SETTINGS);
      expect(binding).to.be.empty;

      await underTest.saveBinding(DEFAULT_TEST_BINDING.projectKey, workspaceFolder, false, DEFAULT_CONNECTION_ID);

      binding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get<ProjectBinding>(BINDING_SETTINGS);
      expect(binding).to.deep.equal({
        connectionId: DEFAULT_CONNECTION_ID,
        projectKey: 'test.project.key'
      });

      await underTest.deleteBindingsForConnection(
        new Connection(undefined, TEST_SONARQUBE_CONNECTION.connectionId, 'sonarqubeConnection', 'ok')
      );

      const defaultConnectionBindings = await underTest.getAllBindings().get(DEFAULT_CONNECTION_ID);
      expect(defaultConnectionBindings).to.be.equal(undefined);
    });

    test('If connectionId not provided, it should default to <default>', async () => {
      await VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY)
        .update(
          CONNECTED_MODE_SETTINGS_SONARQUBE,
          [DEFAULT_TEST_SONARQUBE_CONNECTION],
          VSCode.ConfigurationTarget.Global
        );
      await resetBindings();

      const workspaceFolder = VSCode.workspace.workspaceFolders[0];

      let binding = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri).get(BINDING_SETTINGS);
      expect(binding).to.be.empty;

      await underTest.saveBinding(DEFAULT_TEST_BINDING.projectKey, workspaceFolder, false, undefined);

      binding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get<ProjectBinding>(BINDING_SETTINGS);
      expect(binding).to.deep.equal({
        connectionId: DEFAULT_CONNECTION_ID,
        projectKey: 'test.project.key'
      });
    });

    test('Create Or Edit Binding', async () => {
      const workspaceFolder = VSCode.workspace.workspaceFolders[0];

      let binding = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri).get(BINDING_SETTINGS);
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
        connectionId: TEST_BINDING.connectionId,
        projectKey: 'projectKey2'
      });
    });

    test('Unbound folder should be autobound', () => {
      const workspaceFolder = VSCode.workspace.workspaceFolders[0];

      let binding = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri).get(BINDING_SETTINGS);
      expect(binding).to.be.empty;

      expect(underTest.shouldBeAutoBound(workspaceFolder)).to.be.true;
    });

    test('Bound folder should not be autobound', async () => {
      const workspaceFolder = VSCode.workspace.workspaceFolders[0];

      await VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY)
        .update(CONNECTED_MODE_SETTINGS_SONARQUBE, [TEST_SONARQUBE_CONNECTION], VSCode.ConfigurationTarget.Global);

      await VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .update(BINDING_SETTINGS, TEST_BINDING);

      expect(underTest.shouldBeAutoBound(workspaceFolder)).to.be.false;
    });

    test('should get base server url', async () => {
      expect(await underTest.getBaseServerUrl('connectionId', 'SonarQube')).to.be.equal(
        'https://next.sonarqube.com/sonarqube/dashboard'
      );
      expect(await underTest.getBaseServerUrl('connectionId', 'SonarCloud')).to.be.equal(
        'https://sonarcloud.io/project/overview'
      );
    });

    test('Should not allow creating binding for broken connection', async () => {
      const workspaceFolder = VSCode.workspace.workspaceFolders[0];

      let binding = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri).get(BINDING_SETTINGS);
      expect(binding).to.be.empty;
      await underTest.createOrEditBinding('brokenConnection', 'contextValue', workspaceFolder, 'SonarQube');
      
      binding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get<ProjectBinding>(BINDING_SETTINGS);
      expect(binding).to.be.empty;
    });
  });


  suite('Assist Binding', () => {
    let underTest;
    setup(() => {
      underTest = new BindingService(mockClient, mockWorkspaceState, mockSettingsService, sharedConnectedModeSettingsService);
    });

    test('Should not do anything when binding already exists', async () => {
      const workspaceFolder = VSCode.workspace.workspaceFolders[0];

      const existingBinding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get(BINDING_SETTINGS);
      expect(existingBinding).to.be.empty;

      await underTest.saveBinding(TEST_BINDING.projectKey, workspaceFolder, false, TEST_BINDING.connectionId);

      const updatedBinding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get<ProjectBinding>(BINDING_SETTINGS);
      expect(updatedBinding).to.deep.equal(TEST_BINDING);

      let result;
      underTest.assistBinding({ connectionId: TEST_BINDING.connectionId, projectKey: TEST_BINDING.projectKey })
        .then(r => result = r);

      // assist binding will ask for quick pick
      await selectFirstQuickPickItem();

      const afterAssistance = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get<ProjectBinding>(BINDING_SETTINGS);
      expect(afterAssistance).to.deep.equal(TEST_BINDING);
      expect(result.configurationScopeId).to.equal(workspaceFolder.uri.toString())
    }).timeout(5_000);

    test('Should create requested binding', async () => {
      const workspaceFolder = VSCode.workspace.workspaceFolders[0];

      const existingBinding = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get(BINDING_SETTINGS);
      expect(existingBinding).to.be.empty;

      let result;
      underTest.assistBinding({ connectionId: TEST_BINDING.connectionId, projectKey: TEST_BINDING.projectKey })
        .then(r => result = r);

      await selectFirstQuickPickItem();

      const afterAssistance = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get<ProjectBinding>(BINDING_SETTINGS);
      expect(afterAssistance).to.deep.equal(TEST_BINDING);
      expect(result.configurationScopeId).to.equal(workspaceFolder.uri.toString())
    }).timeout(5_000);
  })
});
