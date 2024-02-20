/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2024 SonarSource SA
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
import { ListFilesInScopeResponse, FolderUriParams } from '../../src/lsp/protocol';

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

    test('Nothing crashes when folder does not exist', async () => {
      let params: FolderUriParams = {
        folderUri: 'nonExistentFolder'
      };
      const p = await underTest.listFilesInFolder(params)

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
      let params: FolderUriParams = {
        folderUri: VSCode.Uri.parse(workspaceFolder1.uri.path).toString()
      };
      const foundFiles: ListFilesInScopeResponse = await underTest.listFilesInFolder(params)

      expect(foundFiles.foundFiles).to.not.be.empty;
      expect(foundFiles.foundFiles.map(value => value.fileName)).to.contain(propsFileName);
      expect(foundFiles.foundFiles.map(value => value.content)).to.contain(fileContent);

      await VSCode.workspace.fs.delete(projectPropsUri);
    });

    test('Regular file is properly found and does not have content', async () => {
      const javaFileName = 'foo.java';
      const fileContent = `class Foo {}`;

      const workspaceFolder1 = VSCode.workspace.workspaceFolders[0];
      const javaFileUri = VSCode.Uri.file(path.join(workspaceFolder1.uri.path, javaFileName));

      await VSCode.workspace.fs.writeFile(
        javaFileUri,
        new TextEncoder().encode(fileContent)
      );
      let params: FolderUriParams = {
        folderUri: VSCode.Uri.parse(workspaceFolder1.uri.path).toString()
      };
      const foundFiles: ListFilesInScopeResponse = await underTest.listFilesInFolder(params)

      const filesMatchingJavaFileName = foundFiles.foundFiles.filter(file => file.fileName === javaFileName);
      expect(filesMatchingJavaFileName).to.not.be.empty;
      const foundJavaFile = filesMatchingJavaFileName.pop();
      expect(foundJavaFile.content).to.be.null;

      await VSCode.workspace.fs.delete(javaFileUri);
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
