/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
  createAnalysisFilesFromFileUris,
  findFilesInFolder, getQuickPickListItemsForWorkspaceFolders,
  isRunningAutoBuild,
  startedInDebugMode
} from '../../src/util/util';
import { expect } from 'chai';
import * as vscode from 'vscode';
import * as path from 'path';
import { Range, Uri } from 'vscode';


const sampleFolderLocation = '../../../test/samples/';

suite('util', () => {
  test('should detect --debug', () => {
    process.execArgv = ['param1', '--debug', 'param2'];
    expect(startedInDebugMode(process)).to.be.true;
  });

  test('should detect --debug-brk', () => {
    process.execArgv = ['param1', '--debug-brk', 'param2'];
    expect(startedInDebugMode(process)).to.be.true;
  });

  test('should detect --inspect-brk', () => {
    process.execArgv = ['param1', '--inspect-brk', 'param2'];
    expect(startedInDebugMode(process)).to.be.true;
  });

  test('should fail to detect arg', () => {
    process.execArgv = ['param1', 'param2'];
    expect(startedInDebugMode(process)).to.be.false;
  });

  test('should not have args', () => {
    process.execArgv = null;
    expect(startedInDebugMode(process)).to.be.false;
  });

  test('should recognize build running on azure pipelines', () => {
    process.env.NODE_ENV = 'continuous-integration';
    expect(isRunningAutoBuild()).to.be.true;
  });

  test('should recognize build running locallly', () => {
    delete process.env.NODE_ENV
    expect(isRunningAutoBuild()).to.be.false;
  });

  test('should find all files in folder', async () => {

    const folderUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation));

    const files = await findFilesInFolder(folderUri);

    expect(files.length).to.equal(6);
  });

  test('should create analysis files from file uris', async () => {
    const folderUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation));
    const fileUris = await findFilesInFolder(folderUri);
    // @ts-ignore
    const openDocuments: vscode.TextDocument[] = [{
      uri: fileUris[1],
      version: 11,
      getText(): string { return 'text in editor' },
      languageId: 'languageFromEditor'
  }];
    const analysisFiles = await createAnalysisFilesFromFileUris(fileUris, openDocuments);
    analysisFiles.forEach(f => console.log(JSON.stringify(f)));
    expect(analysisFiles.length).to.equal(6);
    let inlineAnalysisResult = analysisFiles[0].text.replace(/(\r\n|\n|\r)/gm, "");
    expect(inlineAnalysisResult).to.equal('{    "sonarlint.testFilePattern": "**/test/samples/**/test/**",' +
      '    "telemetry.enableTelemetry": false}');
    expect(analysisFiles[0].uri.endsWith('settings.json')).to.be.true;
    expect(analysisFiles[0].languageId).to.equal('[unknown]');
    expect(analysisFiles[0].version).to.equal(1);
    expect(analysisFiles[1].text).to.equal('text in editor');
    expect(analysisFiles[1].uri.endsWith('main.js')).to.be.true;
    expect(analysisFiles[1].languageId).to.equal('[unknown]');
    expect(analysisFiles[1].version).to.equal(11);
  });

  test('should generate items for quick pick list from workspace folders', async () => {
    const folderUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation));
    const workspaceFolder = {
      uri: folderUri,
      name: 'Name',
      index: 0
    };

    const quickPickListItems = getQuickPickListItemsForWorkspaceFolders([workspaceFolder]);

    expect(quickPickListItems.length).to.equal(1);
    expect(quickPickListItems[0].label).to.equal(workspaceFolder.name);
    expect(quickPickListItems[0].description).to.equal(folderUri.path);
  });

});
