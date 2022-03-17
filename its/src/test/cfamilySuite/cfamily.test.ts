/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2022 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from 'assert';
import * as path from 'path';
import * as CompareVersions from 'compare-versions';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

import { waitForSonarLintDiagnostics } from '../common/util';

const sampleFolderLocation = '../../../samples/';
const sampleCfamilyFolderLocation = '../../../samples/sample-cfamily/';

suite('CFamily Test Suite', () => {
  vscode.window.showInformationMessage('Start cfamily tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('sonarsource.sonarlint-vscode'));
  });

  test('should report issue on cpp file',  async () => {
    const fileUri = vscode.Uri.file(path.join(__dirname, sampleCfamilyFolderLocation, 'main.cpp'));
    const projectPath = vscode.Uri.file(path.join(__dirname, sampleCfamilyFolderLocation));

    //vscode.workspace.getConfiguration().update('sonarlint.pathToCompileCommands', projectPath.fsPath, vscode.ConfigurationTarget.Workspace);
    const document = await vscode.workspace.openTextDocument(fileUri);

    await vscode.window.showTextDocument(document);
    vscode.commands.executeCommand('SonarLint.ConfigureCompilationDatabase');
    const diags = await waitForSonarLintDiagnostics(fileUri);

    assert.deepEqual(diags.length, 0);
    //assert.equal(diags[0].message, "...");

    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }).timeout(60*1000);

});
