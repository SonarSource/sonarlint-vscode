/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from 'assert';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

import { activateAndShowOutput, waitForSonarLintDiagnostics } from '../common/util';

const samplePythonFolderLocation = '../../../samples/sample-python';

suite('Python Test Suite', () => {
  suiteSetup(async function () {
    this.timeout(10 * 1000);
    vscode.window.showInformationMessage('Starting Python tests.');

    await activateAndShowOutput();
  });

  test('should report cross-file issues on python', async function () {
    const fileUri = vscode.Uri.file(path.join(__dirname, samplePythonFolderLocation, 'main.py'));
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);

    const diags = await waitForSonarLintDiagnostics(fileUri);

    assert.deepEqual(diags.length, 1);
    assert.equal(diags[0].message, "Add 1 missing arguments; 'add' expects 2 positional arguments. [+2 locations]");

    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }).timeout(60 * 1000);
});
