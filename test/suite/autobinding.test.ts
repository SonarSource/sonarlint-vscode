/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2024 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { BindingService } from '../../src/connected/binding';
import {
  ConnectionSettingsService,
  SonarCloudConnection,
  SonarQubeConnection
} from '../../src/settings/connectionsettings';

import * as path from 'path';
import * as VSCode from 'vscode';

import { expect } from 'chai';
import { AutoBindingService, DO_NOT_ASK_ABOUT_AUTO_BINDING_FOR_WS_FLAG } from '../../src/connected/autobinding';
import { TextEncoder } from 'util';
import { FolderUriParams, ListFilesInScopeResponse } from '../../src/lsp/protocol';
import { FileSystemServiceImpl } from '../../src/fileSystem/fileSystemServiceImpl';
import { sleep } from '../testutil';

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
    return _identifier === DO_NOT_ASK_ABOUT_AUTO_BINDING_FOR_WS_FLAG.toString()
      ? this.bindingForWsState
      : this.bindingForFolderState;
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

let tempFiles = [];


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
    for (const fileUri of tempFiles) {
      await VSCode.workspace.fs.delete(fileUri);
    }
    tempFiles = [];
  });

  suite('Bindings Manager', () => {
    let underTest;
    setup(() => {
      FileSystemServiceImpl.init();
      AutoBindingService.init(
        mockBindingService,
        mockWorkspaceState,
        mockSettingsService,
        FileSystemServiceImpl.instance
      );
      underTest = AutoBindingService.instance;
    });

    test(`No autobinding when user said "don't ask again" for folder`, async () => {
      const workspaceFolder = VSCode.workspace.workspaceFolders[0];

      const bindingBefore = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get(BINDING_SETTINGS);
      expect(bindingBefore).to.be.empty;

      await mockWorkspaceState.updateBindingForFolder([workspaceFolder.uri.toString()]);

      await underTest.checkConditionsAndAttemptAutobinding({
        suggestions: { folderUri: [workspaceFolder.uri.toString()] }
      });

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

      await mockWorkspaceState.updateBindingForWs(true);

      await underTest.checkConditionsAndAttemptAutobinding({ suggestions: {} });

      const bindingAfter = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get(BINDING_SETTINGS);
      expect(bindingAfter).to.be.empty;
    });

    test('Nothing crashes when folder does not exist', async () => {
      let params: FolderUriParams = {
        folderUri: 'nonExistentFolder'
      };
      const p = await underTest.listAutobindingFilesInFolder(params);

      expect(p).to.not.be.undefined;
      expect(p.foundFiles).to.be.empty;
    });

    test('Analysis settings file is properly found when it exists', async () => {
      const propsFileName = 'sonar-project.properties';
      const fileContent = `sonar.host.url=https://test.sonarqube.com
      sonar.projectKey=org.sonarsource.sonarlint.vscode:test-project`;

      const workspaceFolder1 = VSCode.workspace.workspaceFolders[0];
      const projectPropsUri = VSCode.Uri.file(path.join(workspaceFolder1.uri.fsPath, propsFileName));

      await VSCode.workspace.fs.writeFile(projectPropsUri, new TextEncoder().encode(fileContent));
      tempFiles.push(projectPropsUri);
      // wait for the file to be actually created and reflected in the fs
      sleep(2000);

      const params: FolderUriParams = {
        folderUri: VSCode.Uri.parse(workspaceFolder1.uri.path).toString()
      };

      // crawl the directory
      await FileSystemServiceImpl.instance.crawlDirectory(VSCode.Uri.parse(params.folderUri));

      const foundFiles: ListFilesInScopeResponse = await underTest.listAutobindingFilesInFolder(params);

      expect(foundFiles.foundFiles).to.not.be.empty;
      expect(foundFiles.foundFiles.map(value => value.fileName)).to.contain(propsFileName);
      expect(foundFiles.foundFiles.map(value => value.content)).to.contain(fileContent);

    });

    test('Connected mode settings file is properly found when it exists', async () => {
      const connectedModeJson = 'connectedMode.json';
      const fileContent = `{
  "sonarQubeUri": "https://test.sonarqube.com",
  "projectKey": "org.sonarsource.sonarlint.vscode:test-project"
}
`;

      const workspaceFolder1 = VSCode.workspace.workspaceFolders[0];
      const connectedModeJsonUri = VSCode.Uri.file(
        path.join(workspaceFolder1.uri.fsPath, '.sonarlint', connectedModeJson)
      );

      await VSCode.workspace.fs.writeFile(connectedModeJsonUri, new TextEncoder().encode(fileContent));
      tempFiles.push(connectedModeJsonUri);

      const params: FolderUriParams = {
        folderUri: VSCode.Uri.parse(workspaceFolder1.uri.path).toString()
      };
      const foundFiles: ListFilesInScopeResponse = await underTest.listAutobindingFilesInFolder(params);

      expect(foundFiles.foundFiles).to.not.be.empty;
      expect(foundFiles.foundFiles.map(value => value.fileName)).to.contain(connectedModeJson);
      expect(foundFiles.foundFiles.map(value => value.content)).to.contain(fileContent);

    });

    test('Connected mode settings file from Visual Studio is properly found when it exists', async () => {
      const connectedModeJson = 'MySolution.json';
      const fileContent = `{
        "SonarQubeUri": "https://test.sonarqube.com",
        "ProjectKey": "org.sonarsource.sonarlint.vscode:test-project"
      }
      `;

      const workspaceFolder1 = VSCode.workspace.workspaceFolders[0];
      const connectedModeJsonUri = VSCode.Uri.file(
        path.join(workspaceFolder1.uri.fsPath, '.sonarlint', connectedModeJson)
      );

      await VSCode.workspace.fs.writeFile(connectedModeJsonUri, new TextEncoder().encode(fileContent));
      tempFiles.push(connectedModeJsonUri);

      const params: FolderUriParams = {
        folderUri: VSCode.Uri.parse(workspaceFolder1.uri.path).toString()
      };

      const foundFiles: ListFilesInScopeResponse = await underTest.listAutobindingFilesInFolder(params);

      expect(foundFiles.foundFiles).to.not.be.empty;
      expect(foundFiles.foundFiles.map(value => value.fileName)).to.contain(connectedModeJson);
      expect(foundFiles.foundFiles.map(value => value.content)).to.contain(fileContent);

    });

    test('Regular file is properly found and does not have content', async () => {
      const javaFileName = 'foo.java';
      const fileContent = `class Foo {}`;

      const workspaceFolder1 = VSCode.workspace.workspaceFolders[0];
      const javaFileUri = VSCode.Uri.file(path.join(workspaceFolder1.uri.fsPath, javaFileName));

      await VSCode.workspace.fs.writeFile(javaFileUri, new TextEncoder().encode(fileContent));
      tempFiles.push(javaFileUri);
      const params: FolderUriParams = {
        folderUri: VSCode.Uri.parse(workspaceFolder1.uri.path).toString()
      };

      // crawl the directory
      await FileSystemServiceImpl.instance.crawlDirectory(VSCode.Uri.parse(params.folderUri));

      const foundFiles: ListFilesInScopeResponse = await underTest.listAutobindingFilesInFolder(params);

      const filesMatchingJavaFileName = foundFiles.foundFiles.filter(file => file.fileName === javaFileName);
      expect(filesMatchingJavaFileName).to.not.be.empty;
      const foundJavaFile = filesMatchingJavaFileName.pop();
      expect(foundJavaFile.content).to.be.null;

    });

    test('Do not propose binding when there are no connections', async () => {
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
  return VSCode.workspace
    .getConfiguration(SONARLINT_CATEGORY, VSCode.workspace.workspaceFolders[0].uri)
    .update(BINDING_SETTINGS, undefined, VSCode.ConfigurationTarget.WorkspaceFolder);
}
