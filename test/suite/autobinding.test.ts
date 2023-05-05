/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { BindingService, ServerProject } from '../../src/connected/binding';
import {
  BaseConnection,
  ConnectionSettingsService,
  SonarCloudConnection,
  SonarQubeConnection
} from '../../src/settings/connectionsettings';

import * as path from 'path';
import * as VSCode from 'vscode';

import { expect } from 'chai';
import { AutoBindingService, DO_NOT_ASK_ABOUT_AUTO_BINDING_FOR_WS_FLAG } from '../../src/connected/autobinding';
import { TextEncoder } from 'util';
import { FindFileByNamesInFolderParams, FindFileByNamesInFolderResponse } from '../../src/lsp/protocol';

const CONNECTED_MODE_SETTINGS_SONARQUBE = 'connectedMode.connections.sonarqube';
const CONNECTED_MODE_SETTINGS_SONARCLOUD = 'connectedMode.connections.sonarcloud';
const SONARLINT_CATEGORY = 'sonarlint';
const BINDING_SETTINGS = 'connectedMode.project';

const TEST_SONARQUBE_CONNECTION = {
  connectionId: 'test',
  serverUrl: 'https://test.sonarqube.com'
};

const mockSettingsService = {
  async loadSonarQubeConnection(connectionId: string): Promise<SonarQubeConnection> {
    return { serverUrl: 'https://next.sonarqube.com/sonarqube', connectionId };
  },
  getSonarQubeConnections(): SonarQubeConnection[] {
    return [
      {
        connectionId: 'SQconnectionId',
        disableNotifications: true,
        serverUrl: 'serverUrl'
      }
    ];
  },
  getSonarCloudConnections(): SonarCloudConnection[] {
    return [
      {
        connectionId: 'SCconnectionId',
        disableNotifications: true,
        organizationKey: 'organizationKey'
      }
    ];
  }
} as ConnectionSettingsService;

const mockBindingService = {
  // nothing to mock for current tests
} as BindingService;

const mockWorkspaceState = {
  bindingForWsState: false,
  bindingForFolderState: [],
  keys: () => [],
  get(_identifier: string) {
    return _identifier === DO_NOT_ASK_ABOUT_AUTO_BINDING_FOR_WS_FLAG.toString() ? this.bindingForWsState : this.bindingForFolderState;
  },
  async updateBindingForWs(newState: boolean) {
    this.bindingForWsState = newState;
  },
  async updateBindingForFolder(newState: string[]) {
    this.bindingForFolderState = newState;
  },
  async update(key: string, value: any) {
    // For compatibiity
  }
};

suite('Auto Binding Test Suite', () => {
  setup(async () => {
    // start from 1 SQ connection config
    await VSCode.workspace
      .getConfiguration(SONARLINT_CATEGORY)
      .update(CONNECTED_MODE_SETTINGS_SONARQUBE, [TEST_SONARQUBE_CONNECTION], VSCode.ConfigurationTarget.Global);

    await cleanBindings();
  });

  teardown(async () => {
    await cleanBindings();
    await VSCode.commands.executeCommand('workbench.action.closeAllEditors');
    await mockWorkspaceState.updateBindingForWs(false);
    await mockWorkspaceState.updateBindingForFolder([]);
  });

  suite('Bindings Manager', () => {
    let underTest;
    setup(() => {
      underTest = new AutoBindingService(mockBindingService, mockWorkspaceState, mockSettingsService);
    });

    test(`No autobinding when user said "don't ask again" for folder`, async () => {
      const workspaceFolder = VSCode.workspace.workspaceFolders[0];

      const bindingBefore = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get(BINDING_SETTINGS);
      expect(bindingBefore).to.be.empty;

      mockWorkspaceState.updateBindingForFolder([workspaceFolder.uri.toString()]);

      underTest.checkConditionsAndAttemptAutobinding({ suggestions: {folderUri: [workspaceFolder.uri.toString()]} });

      const bindingAfter = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get(BINDING_SETTINGS);
      expect(bindingAfter).to.be.empty;
    });

    test(`No autobinding when user said "don't ask again" for workspace`, async () => {
      const workspaceFolder = VSCode.workspace.workspaceFolders[0];

      const bindingBefore = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get(BINDING_SETTINGS);
      expect(bindingBefore).to.be.empty;

      mockWorkspaceState.updateBindingForWs(true);

      underTest.checkConditionsAndAttemptAutobinding({ suggestions: {} });

      const bindingAfter = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get(BINDING_SETTINGS);
      expect(bindingAfter).to.be.empty;
    });

    test('Nothing crashes when analysis file is not present', async () => {
      const workspaceFolder1 = VSCode.workspace.workspaceFolders[0];

      let params: FindFileByNamesInFolderParams = {
        filenames: ['non-existing-file'],
        folderUri: VSCode.Uri.parse(workspaceFolder1.uri.path).toString()
      };
      const p = await underTest.findFileByNameInFolderRequest(params);

      expect(p).to.not.be.undefined
      expect(p.foundFiles).to.be.empty;
    });

    test('Analysis settings file is properly found when it exists', async () => {
      const propsFileName = 'sonar-project.properties';
      const fileContent = `sonar.host.url=https://test.sonarqube.com
      sonar.projectKey=org.sonarsource.sonarlint.vscode:test-project`;

      const workspaceFolder1 = VSCode.workspace.workspaceFolders[0];
      const projectPropsUri = VSCode.Uri.file(path.join(workspaceFolder1.uri.path, propsFileName));

      await VSCode.workspace.fs.writeFile(
        projectPropsUri,
        new TextEncoder().encode(fileContent)
      );
      let params: FindFileByNamesInFolderParams = {
        filenames: [propsFileName],
        folderUri: VSCode.Uri.parse(workspaceFolder1.uri.path).toString()
      };
      const foundFiles: FindFileByNamesInFolderResponse = await underTest.findFileByNameInFolderRequest(params);

      expect(foundFiles.foundFiles.length).to.equal(1);
      expect(foundFiles.foundFiles[0].fileName).to.equal(propsFileName);
      expect(foundFiles.foundFiles[0].content).to.contain('sonar.host.url=https://test.sonarqube.com');

      await VSCode.workspace.fs.delete(projectPropsUri);
    });

    test('Do not propose binding when there are no connections',async () => {
      const workspaceFolder = VSCode.workspace.workspaceFolders[0];

      await VSCode.workspace
      .getConfiguration(SONARLINT_CATEGORY)
      .update(CONNECTED_MODE_SETTINGS_SONARQUBE, undefined, VSCode.ConfigurationTarget.Global);

      await VSCode.workspace
      .getConfiguration(SONARLINT_CATEGORY)
      .update(CONNECTED_MODE_SETTINGS_SONARCLOUD, undefined, VSCode.ConfigurationTarget.Global);

      const bindingBefore = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get(BINDING_SETTINGS);
      expect(bindingBefore).to.be.empty;

      underTest.checkConditionsAndAttemptAutobinding({ suggestions: {} });

      const bindingAfter = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get(BINDING_SETTINGS);
      expect(bindingAfter).to.be.empty;
    });
  });
});

async function cleanBindings() {
  return Promise.all(
    VSCode.workspace.workspaceFolders.map(folder => {
      return VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, folder.uri)
        .update(BINDING_SETTINGS, undefined, VSCode.ConfigurationTarget.WorkspaceFolder);
    })
  );
}
