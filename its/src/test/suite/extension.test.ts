/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as assert from 'assert';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

import { waitForSonarLintDiagnostics, dumpLogOutput } from '../common/util';

const sampleFolderLocation = '../../../samples/';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('sonarsource.sonarlint-vscode'));
  });

  test('should report issue on single js file', async function () {
    const ext = vscode.extensions.getExtension('sonarsource.sonarlint-vscode')!;
    await ext.activate();

    vscode.commands.executeCommand('SonarLint.ShowSonarLintOutput');

    const fileUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation, 'sample-js', 'main.js'));
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);

    const diags = await waitForSonarLintDiagnostics(fileUri);

    dumpLogOutput();

    assert.strictEqual(diags.length, 2);
    assert.strictEqual(diags[0].message, "Remove the declaration of the unused 'i' variable.");
    assert.strictEqual(diags[1].message, "Unexpected var, use let or const instead.");
    assert.equal(diags[0].message, "Remove the declaration of the unused 'i' variable.");

    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }).timeout(60 * 1000);

  test('should report issue on single yaml file', async function () {
    const ext = vscode.extensions.getExtension('sonarsource.sonarlint-vscode')!;
    await ext.activate();

    vscode.commands.executeCommand('SonarLint.ShowSonarLintOutput');

    const fileUri = vscode.Uri.file(path.join(__dirname, sampleFolderLocation, 'sample-js', 'lambda.yaml'));
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);

    const diags = await waitForSonarLintDiagnostics(fileUri);

    dumpLogOutput();

    assert.strictEqual(diags.length, 1);
    assert.strictEqual(diags[0].message, "Remove the declaration of the unused 'x' variable.");

    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }).timeout(60 * 1000);
});
