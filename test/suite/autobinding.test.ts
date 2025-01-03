/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { BindingService, ProjectBinding } from '../../src/connected/binding';
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
import { FolderUriParams, ListFilesInScopeResponse, SuggestBindingParams } from '../../src/lsp/protocol';
import { FileSystemServiceImpl } from '../../src/fileSystem/fileSystemServiceImpl';
import { sleep } from '../testutil';
import { SonarLintExtendedLanguageClient } from '../../src/lsp/client';
import * as sinon from 'sinon';

const CONNECTED_MODE_SETTINGS_SONARQUBE = 'connectedMode.connections.sonarqube';
const CONNECTED_MODE_SETTINGS_SONARCLOUD = 'connectedMode.connections.sonarcloud';
const SONARLINT_CATEGORY = 'sonarlint';
const BINDING_SETTINGS = 'connectedMode.project';

const TEST_SONARQUBE_CONNECTION = {
  connectionId: 'test',
  serverUrl: 'https://test.sonarqube.com'
};

const mockClient = {
  async getRemoteProjectsForConnection(_connectionId: string): Promise<Object> {
    return { projectKey1: 'projectName1', projectKey2: 'projectName2' };
  },
  async checkConnection(connectionId: string) {
    return Promise.resolve({ connectionId, success: true });
  },
  async getSuggestedBinding(configScopeId:string, connectionId: string):Promise<SuggestBindingParams> {
    return Promise.resolve({suggestions: {
      [configScopeId]: [{
        connectionId: connectionId,
        sonarProjectKey: 'myProjectKey',
        sonarProjectName: 'myProjectName',
        isFromSharedConfiguration: false
      }]
    }});
  },
  async didCreateBinding(mode) {
    return Promise.resolve();
  }
} as SonarLintExtendedLanguageClient;

const mockSettingsService = {
  async loadSonarQubeConnection(connectionId: string): Promise<SonarQubeConnection> {
    return { serverUrl: 'https://next.sonarqube.com/sonarqube', connectionId };
  },
  getSonarQubeConnections(): SonarQubeConnection[] {
    return [];
  },
  getSonarCloudConnections(): SonarCloudConnection[] {
    return [];
  }
} as ConnectionSettingsService;

const mockSettingsServiceWitConnections = {
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
  isBound(workspaceFolder: VSCode.WorkspaceFolder): boolean {
    const config = VSCode.workspace.getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri);
    const binding = config.get<ProjectBinding>(BINDING_SETTINGS);
    return !!binding.projectKey;
  }
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
    sinon.restore();
  });

  suite('Bindings Manager', () => {
    let underTest : AutoBindingService;
    let underTestWithConnections : AutoBindingService;
    setup(() => {
      FileSystemServiceImpl.init();
      AutoBindingService.init(
        mockBindingService,
        mockWorkspaceState,
        mockSettingsService,
        FileSystemServiceImpl.instance,
        mockClient
      );
      underTest = AutoBindingService.instance;
      AutoBindingService.init(
        mockBindingService,
        mockWorkspaceState,
        mockSettingsServiceWitConnections,
        FileSystemServiceImpl.instance,
        mockClient
      );
      underTestWithConnections = AutoBindingService.instance;
    });

    test(`No autobinding when user said "don't ask again" for folder`, async () => {
      const workspaceFolder = VSCode.workspace.workspaceFolders[0];

      const bindingBefore = VSCode.workspace
        .getConfiguration(SONARLINT_CATEGORY, workspaceFolder.uri)
        .get(BINDING_SETTINGS);
      expect(bindingBefore).to.be.empty;

      await mockWorkspaceState.updateBindingForFolder([workspaceFolder.uri.toString()]);

      await underTest.checkConditionsAndAttemptAutobinding({
        suggestions: { [workspaceFolder.uri.toString()]: [{
          connectionId: 'test',
          sonarProjectKey: 'myProjectKey',
          sonarProjectName: 'myProjectName',
          isFromSharedConfiguration: false
        }] }
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

      // make sure results get in place
      await sleep(500);

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

    test('Should not autobind workspace when no connection exists', async () => {
      // Make sure no connection exists
      await VSCode.workspace
      .getConfiguration(SONARLINT_CATEGORY)
      .update(CONNECTED_MODE_SETTINGS_SONARQUBE, undefined, VSCode.ConfigurationTarget.Global);

      await VSCode.workspace
      .getConfiguration(SONARLINT_CATEGORY)
      .update(CONNECTED_MODE_SETTINGS_SONARCLOUD, undefined, VSCode.ConfigurationTarget.Global);

      // Create a spy for the showWarningMessage method
      const showWarningMessageSpy = sinon.spy(VSCode.window, 'showWarningMessage');
  
      // Call the function that triggers the notification
      await underTest.autoBindWorkspace();
  
      // Assert that the notification was shown
      expect(showWarningMessageSpy.calledOnce).to.be.true;
      expect(showWarningMessageSpy.calledWith(`"Bind all workspace folders to SonarQube (Server, Cloud)"
      can only be invoked if a SonarQube (Server, Cloud) connection exists`)).to.be.true;
  
      // Restore the original method
      showWarningMessageSpy.restore();
    });

    test('Should show warning message when all folders are already bound', async () => {
      // Bind all folders in the workspace
      await Promise.all(VSCode.workspace.workspaceFolders.map(async (folder) => {
        await VSCode.workspace
          .getConfiguration(SONARLINT_CATEGORY, folder.uri)
          .update(BINDING_SETTINGS, {'projectKey': 'myProjectKey'}, VSCode.ConfigurationTarget.WorkspaceFolder);
      }));

      // Create a spy for the showInformationMessage method
      const showInformationMessage = sinon.spy(VSCode.window, 'showInformationMessage');
  
      // Call the function that triggers the notification
      await underTestWithConnections.autoBindWorkspace();
  
      // Assert that the notification was shown
      expect(showInformationMessage.calledOnce).to.be.true;
      expect(showInformationMessage.calledWith(`All folders in this workspace are already bound
         to SonarQube (Server, Cloud) projects`)).to.be.true;
  
      // Restore the original method
      showInformationMessage.restore();

      // UN-Bind all folders in the workspace & restore all other settings
      await Promise.all(VSCode.workspace.workspaceFolders.map(async (folder) => {
        await VSCode.workspace
          .getConfiguration(SONARLINT_CATEGORY, folder.uri)
          .update(BINDING_SETTINGS, undefined, VSCode.ConfigurationTarget.WorkspaceFolder);
      }));
    });

    test('Should show binding suggestion notification', async () => {
      const showQuickPickStub = sinon.stub(VSCode.window, 'showQuickPick');
      showQuickPickStub.onFirstCall().resolves(VSCode.workspace.workspaceFolders[0].name);
      showQuickPickStub.onSecondCall().resolves('SQconnectionId');

      // Create a spy for the showInformationMessage method
      const showInformationMessage = sinon.spy(VSCode.window, 'showInformationMessage');
  
      // Call the function that triggers the notification
      underTestWithConnections.autoBindWorkspace();
      await sleep(1000);

      // Assert that the notification was shown
      expect(showInformationMessage.called).to.be.true;
      expect(showInformationMessage.getCall(0).args[0]).to.equal("Do you want to bind folder 'sample-for-bindings' to project 'myProjectKey' of SonarQube Server 'undefined'?\n" +
        '      [Learn More](https://docs.sonarsource.com/sonarqube-for-ide/vs-code/team-features/connected-mode/)');
      expect(showInformationMessage.getCall(0).args[1]).to.equal('Configure Binding');
      expect(showInformationMessage.getCall(0).args[2]).to.equal('Choose Manually');
      expect(showInformationMessage.getCall(0).args[3]).to.equal("Don't Ask Again");

      // Restore the original method
      showInformationMessage.restore();
    });
  });
});

async function cleanBindings() {
  const workspaceFolders = VSCode.workspace.workspaceFolders;
  if (workspaceFolders) {
    for (const folder of workspaceFolders) {
      const settingsUri = VSCode.Uri.joinPath(folder.uri, '.vscode', 'settings.json');
      try {
        await VSCode.workspace.fs.delete(settingsUri, { recursive: true, useTrash: false });
      } catch (error) {
        console.error(`Failed to delete settings file: ${settingsUri.fsPath}`, error);
      }
    }
  }
}
