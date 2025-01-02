/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { SonarLintExtendedLanguageClient } from '../../src/lsp/client';
import { ExtensionContext } from 'vscode';
import { SharedConnectedModeSettingsService } from '../../src/connected/sharedConnectedModeSettingsService';
import { FileSystemServiceImpl } from '../../src/fileSystem/fileSystemServiceImpl';
import * as vscode from 'vscode';
import { expect } from 'chai';
import { TextEncoder } from 'util';
import * as path from 'path';
import { selectFirstQuickPickItem } from './commons';
import { sleep } from '../testutil';

const SHARED_CONNECTED_MODE_FILE_CONTENT = '{\n' + '    "sonarCloudOrganization": "sonarsource",\n' + '    "projectKey": "autoscan.net"\n' + '}';

const mockClient = ({
  async getSharedConnectedModeConfigFileContent(configScopeId) {
    return Promise.resolve({
      jsonFileContent: SHARED_CONNECTED_MODE_FILE_CONTENT        
    });
  }
} as unknown) as SonarLintExtendedLanguageClient;

const fakeContext = {
  globalState: null,
  workspaceState: {
    get<T>(key: string): T | undefined {
      return null;
    }
  },
  subscriptions: null,
  extension: null
} as ExtensionContext;

let tempFiles = [];
suite('Shared Connected Mode service test suite', () => {
  let underTest: SharedConnectedModeSettingsService;
  setup(() => {
    FileSystemServiceImpl.init();
    SharedConnectedModeSettingsService.init(mockClient, FileSystemServiceImpl.instance, fakeContext);
    underTest = SharedConnectedModeSettingsService.instance;
  });

  teardown(async () => {
    for (const fileUri of tempFiles) {
      await vscode.workspace.fs.delete(fileUri);
    }
    tempFiles = [];
  });

  test('Should name file connectedMode.json when no solutions in the folder', async () => {
    const workspaceFolderUri = vscode.workspace.workspaceFolders[0].uri;

    // populate cache
    await FileSystemServiceImpl.instance.crawlDirectory(workspaceFolderUri);

    const result = await underTest.computeSharedConnectedModeFileName(workspaceFolderUri.toString());

    expect(result).to.equal('connectedMode.json');
  });

  test('Should name file by solution when one solution in the folder', async () => {
    const workspaceFolder1 = vscode.workspace.workspaceFolders[0];
    const solutionFileName = 'mySolution.sln';
    const solutionFileUri = vscode.Uri.file(path.join(workspaceFolder1.uri.fsPath, solutionFileName));

    await vscode.workspace.fs.writeFile(solutionFileUri, new TextEncoder().encode(''));
    tempFiles.push(solutionFileUri);

    await FileSystemServiceImpl.instance.crawlDirectory(workspaceFolder1.uri);

    const result = await underTest.computeSharedConnectedModeFileName(workspaceFolder1.uri.toString());

    expect(result).to.equal('mySolution.json');
  });

  test('Should propose options when multiple solutions in the folder', async () => {
    const workspaceFolder1 = vscode.workspace.workspaceFolders[0];
    const solutionFileUri1 = vscode.Uri.file(path.join(workspaceFolder1.uri.fsPath, 'mySolution1.sln'));
    const solutionFileUri2 = vscode.Uri.file(path.join(workspaceFolder1.uri.fsPath, 'myOtherSolution.sln'));

    await vscode.workspace.fs.writeFile(solutionFileUri1, new TextEncoder().encode(''));
    await vscode.workspace.fs.writeFile(solutionFileUri2, new TextEncoder().encode(''));
    tempFiles.push(solutionFileUri1, solutionFileUri2);

    await FileSystemServiceImpl.instance.crawlDirectory(workspaceFolder1.uri);

    const resultPromise = underTest.computeSharedConnectedModeFileName(workspaceFolder1.uri.toString());
    await selectFirstQuickPickItem();

    expect(await resultPromise).to.equal('myOtherSolution.json'); // QuickPick items are sorted alphabetically
  }).timeout(5000);

  test('Should create shared connected mode config file', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    const workspaceFolderUri = workspaceFolder.uri;
    const expectedFileUri = vscode.Uri.file(path.resolve(workspaceFolderUri.fsPath, '.sonarlint/connectedMode.json'));

    try {
      // make sure we start with a clean state
      await vscode.workspace.fs.delete(expectedFileUri);
    } catch (e) {
      console.log(e);
    }

    await FileSystemServiceImpl.instance.crawlDirectory(workspaceFolder.uri);

    await underTest.createSharedConnectedModeSettingsFile(workspaceFolder);

    // wait for file to be created and ready to be read
    await sleep(2000);

    const fileContent = await vscode.workspace.fs.readFile(expectedFileUri);

    expect(fileContent).to.not.be.null;
    expect(fileContent.toString()).to.contain(SHARED_CONNECTED_MODE_FILE_CONTENT);

    vscode.workspace.fs.delete(expectedFileUri);
  }).timeout(5000);

  test('Should deduplicate suggestions', () => {
    const suggestions1 = [
      {
        connectionSuggestion: {
          serverUrl: 'localhost:9000',
          projectKey: 'myProject'
        },
        isFromSharedConfiguration: true
      },
      {
        connectionSuggestion: {
          serverUrl: 'localhost:9000',
          projectKey: 'myProject'
        },
        isFromSharedConfiguration: true
      },
      {
        connectionSuggestion: {
          organization: 'myOrg',
          projectKey: 'myProject'
        },
        isFromSharedConfiguration: true
      },
      {
        connectionSuggestion: {
          serverUrl: 'localhost:9090',
          projectKey: 'myProject'
        },
        isFromSharedConfiguration: true
      }
    ];

    const uniqueSuggestions1 = underTest.deduplicateSuggestions(suggestions1);

    expect(uniqueSuggestions1.length).to.equal(3);


    const suggestions2 = [
      {
        connectionSuggestion: {
          serverUrl: 'localhost:9000',
          projectKey: 'myProject'
        },
        isFromSharedConfiguration: false
      },
      {
        connectionSuggestion: {
          serverUrl: 'localhost:9000',
          projectKey: 'myProject212'
        },
        isFromSharedConfiguration: false
      },
      {
        connectionSuggestion: {
          organization: 'myOrg',
          projectKey: 'myProject'
        },
        isFromSharedConfiguration: false
      },
      {
        connectionSuggestion: {
          serverUrl: 'localhost:9090',
          projectKey: 'myProject'
        },
        isFromSharedConfiguration: false
      }
    ];

    const uniqueSuggestions2 = underTest.deduplicateSuggestions(suggestions2);

    expect(uniqueSuggestions2.length).to.equal(4);

    const suggestions3 = [
      {
        connectionSuggestion: {
          organization: 'myOrg',
          projectKey: 'myProject'
        },
        isFromSharedConfiguration: true
      },
      {
        connectionSuggestion: {
          organization: 'myOrg',
          projectKey: 'myProject'
        },
        isFromSharedConfiguration: true
      },
      {
        connectionSuggestion: {
          organization: 'myOrg',
          projectKey: 'myProject'
        },
        isFromSharedConfiguration: true
      },
      {
        connectionSuggestion: {
          organization: 'myOrg',
          projectKey: 'myProject'
        },
        isFromSharedConfiguration: true
      }
    ];

    const uniqueSuggestions3 = underTest.deduplicateSuggestions(suggestions3);

    expect(uniqueSuggestions3.length).to.equal(1);
  });
});
