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

    const analysisFiles = await createAnalysisFilesFromFileUris(fileUris);

    expect(analysisFiles.length).to.equal(6);
    expect(analysisFiles[0].text).to.equal('{\n' +
      '    "sonarlint.testFilePattern": "**/test/samples/**/test/**",\n' +
      '    "telemetry.enableTelemetry": false\n' +
      '}\n');
    expect(analysisFiles[0].uri.endsWith('settings.json')).to.be.true;
    expect(analysisFiles[0].languageId).to.equal('[unknown]');
    expect(analysisFiles[0].version).to.equal(1);
  });

  test('should generate items for quick pick list from workspace folders', async () => {
    const folderUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation));
    const wf = {
      uri: folderUri,
      name: 'Name',
      index: 0
    };

    const quickPickListItems = getQuickPickListItemsForWorkspaceFolders([wf]);

    expect(quickPickListItems.length).to.equal(1);
    expect(quickPickListItems[0].label).to.equal(wf.name);
    expect(quickPickListItems[0].description).to.equal(folderUri.path);
  });

});
