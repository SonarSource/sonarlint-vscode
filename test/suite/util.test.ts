/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { expect } from 'chai';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  createAnalysisFilesFromFileUris,
  findFilesInFolder,
  getFilesMatchedGlobPatterns, getFilesNotMatchedGlobPatterns, getIdeFileExclusions,
  getMasterRegex,
  getQuickPickListItemsForWorkspaceFolders,
  globPatternToRegex,
  isRunningAutoBuild,
  startedInDebugMode
} from '../../src/util/util';

const sampleFolderLocation = '../../../test/samples/';

const progress: vscode.Progress<any> = {
  report() { /* NOP */ }
};
const cancelToken: vscode.CancellationToken = { isCancellationRequested: false, onCancellationRequested: null };

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

  test('should recognize build running on cirrus-ci pipelines', () => {
    process.env.NODE_ENV = 'continuous-integration';
    expect(isRunningAutoBuild()).to.be.true;
  });

  test('should recognize build running locallly', () => {
    delete process.env.NODE_ENV;
    expect(isRunningAutoBuild()).to.be.false;
  });

  test('should find all files in folder', async () => {
    const folderUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation));

    const files = await findFilesInFolder(folderUri, cancelToken);

    expect(files.length).to.equal(7);
  });

  test('should create analysis files from file uris', async () => {
    const folderUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation));
    const fileUris = await findFilesInFolder(folderUri, cancelToken);
    // @ts-ignore
    const openDocuments: vscode.TextDocument[] = [{
      uri: fileUris[1],
      version: 11,
      getText(): string {
        return 'text in editor';
      },
      languageId: 'languageFromEditor'
    }];
    const analysisFiles = await createAnalysisFilesFromFileUris(fileUris, openDocuments, progress, cancelToken);

    expect(fileUris.length).to.equal(7);
    expect(analysisFiles.length).to.equal(6);
    let inlineAnalysisResult = analysisFiles[0].text.replace(/(\r\n|\n|\r)/gm, '');
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

  test('should convert glob pattern to regex', async () => {
    expect(globPatternToRegex('**/*.java').source).to.equal('\\.java$');
    expect(globPatternToRegex('**/*.c++').source).to.equal('^((?:[^/]*(?:\\/|$))*)([^/]*)\\.c\\+\\+$');
    expect(globPatternToRegex('**/**/*.c++').source).to.equal('^((?:[^/]*(?:\\/|$))*)((?:[^/]*(?:\\/|$))*)([^/]*)\\.c\\+\\+$');
    expect(globPatternToRegex('/**').source).to.equal('^\\/((?:[^/]*(?:\\/|$))*)$');
    expect(globPatternToRegex('**/*Bean?.java').source).to.equal('^((?:[^/]*(?:\\/|$))*)([^/]*)Bean.\\.java$');
  });

  test('should build master regex pattern from array of glob patterns', async () => {
    const masterRegex = getMasterRegex(['**/*.java', '**/*.php', '**/*.c++']);
    expect(masterRegex.source).to.equal('\\.java$|\\.php$|^((?:[^/]*(?:\\/|$))*)([^/]*)\\.c\\+\\+$');
  });

  test('should filter files by glob patterns', async () => {
    const files: vscode.Uri[] = [];
    // @ts-ignore
    files.push({
      path: 'anyDirectory/anyFile.css'
    });
    // @ts-ignore
    files.push({
      path: 'org/sonar.api/MyBean.java'
    });
    // @ts-ignore
    files.push({
      path: 'org/sonar/util/MyDTO.java'
    });
    // @ts-ignore
    files.push({
      path: 'org/sonar/util/MyOtherBean1.java'
    });
    // @ts-ignore
    files.push({
      path: 'org/sonar/util/MyOtherBean.java'
    });
    // @ts-ignore
    files.push({
      path: 'org/sonar/MyClass.java'
    });
    // @ts-ignore
    files.push({
      path: 'org/sonar/util/MyClassUtil.java'
    });
    // @ts-ignore
    files.push({
      path: 'org/radar/MyClass.java'
    });

    let globPatterns = ['**/*.css'];
    let matchedFiles = getFilesMatchedGlobPatterns(files, globPatterns);
    let notMatchedFiles = getFilesNotMatchedGlobPatterns(files, globPatterns);
    expect(matchedFiles.length).to.equal(1);
    expect(matchedFiles[0].path).to.equal('anyDirectory/anyFile.css');
    expect(notMatchedFiles.length).to.equal(7);

    globPatterns = ['**/*Bean.java'];
    matchedFiles = getFilesMatchedGlobPatterns(files, globPatterns);
    notMatchedFiles = getFilesNotMatchedGlobPatterns(files, globPatterns);
    expect(matchedFiles.length).to.equal(2);
    expect(matchedFiles).to.eql([{ path: 'org/sonar.api/MyBean.java' }, { path: 'org/sonar/util/MyOtherBean.java' }]);
    expect(notMatchedFiles.length).to.equal(6);

    globPatterns = ['**/*Bean?.java'];
    matchedFiles = getFilesMatchedGlobPatterns(files, globPatterns);
    notMatchedFiles = getFilesNotMatchedGlobPatterns(files, globPatterns);
    expect(matchedFiles.length).to.equal(1);
    expect(matchedFiles[0].path).to.equal('org/sonar/util/MyOtherBean1.java');
    expect(notMatchedFiles.length).to.equal(7);

    globPatterns = ['org/sonar/*'];
    matchedFiles = getFilesMatchedGlobPatterns(files, globPatterns);
    notMatchedFiles = getFilesNotMatchedGlobPatterns(files, globPatterns);
    expect(matchedFiles.length).to.equal(1);
    expect(matchedFiles[0].path).to.equal('org/sonar/MyClass.java');
    expect(notMatchedFiles.length).to.equal(7);

    globPatterns = ['org/sonar/**/*'];
    matchedFiles = getFilesMatchedGlobPatterns(files, globPatterns);
    notMatchedFiles = getFilesNotMatchedGlobPatterns(files, globPatterns);
    expect(matchedFiles.length).to.equal(5);
    expect(matchedFiles).to.eql([{ path: 'org/sonar/util/MyDTO.java' }, { path: 'org/sonar/util/MyOtherBean1.java' },
      { path: 'org/sonar/util/MyOtherBean.java' }, { path: 'org/sonar/MyClass.java' }, { path: 'org/sonar/util/MyClassUtil.java' }]);
    expect(notMatchedFiles.length).to.equal(3);
  });

  test('should filter files by ide exclusions', async () => {
    const excludes = {
      '**/*.foo': true,
      '**/*.bar': true,
      '**/*.baz': false
    };

    const excludedPatterns = getIdeFileExclusions(excludes);

    expect(excludedPatterns.length).to.equal(2);
    expect(excludedPatterns[0]).to.equal('**/*.foo');
    expect(excludedPatterns[1]).to.equal('**/*.bar');
  });

});
